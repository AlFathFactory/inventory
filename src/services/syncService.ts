import { offlineDb, type OfflineOperation } from '../lib/offlineDb'
import { queryClient } from '../lib/queryClient'
import { supabaseClient } from '../lib/supabaseClient'
import { inventoryKeys } from '../features/inventory/inventoryQueryKeys'
import { claimPendingOperation, getPendingItems, getPendingOperations, recoverInterruptedSyncs } from './offlineQueueService'
import { isInventoryTable, isStockInventoryTable } from './inventoryTablePolicy'
import { getLocalDateString } from '../utils/dateUtils'

let activeSyncPromise: Promise<void> | null = null

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function requireClient() {
  if (!supabaseClient) throw new Error('Supabase غير مهيأ')
  return supabaseClient
}

export function syncOfflineData() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve()
  if (activeSyncPromise) return activeSyncPromise
  activeSyncPromise = performSync().finally(() => { activeSyncPromise = null })
  return activeSyncPromise
}

async function performSync() {
  await recoverInterruptedSyncs()
  await syncPendingItems()
  await syncPendingOperations()
  await queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
}

async function syncPendingItems() {
  const client = requireClient()
  for (const item of await getPendingItems()) {
    try {
      if (!isInventoryTable(item.tableName)) {
        throw new Error(`Unsupported inventory table: ${item.tableName}`)
      }
      await offlineDb.offline_items.update(item.localId, { status: 'syncing', errorMessage: null })
      const payload = { ...item.payload }
      delete payload.internal_code
      let created: Record<string, unknown>
      if (item.serverId) {
        const { data, error } = await client.from(item.tableName).select('*').eq('id', item.serverId).single()
        if (error || !data) throw new Error(error?.message ?? 'تعذر استكمال رفع الصنف')
        created = data as Record<string, unknown>
      } else {
        const { data, error: insertError } = await client.rpc('create_inventory_item_rpc', {
          p_table_name: item.tableName,
          p_payload: payload,
          p_created_by: 'offline-user',
        })
        if (insertError || !data) throw new Error(insertError?.message ?? 'فشل رفع الصنف')
        if (typeof data !== 'object' || !('ok' in data) || !data.ok || !('row' in data)) {
          throw new Error('Inventory create RPC returned an invalid response.')
        }
        const response = data as { item_id: string | number; internal_code?: string | null; row: Record<string, unknown> }
        created = response.row
        await offlineDb.offline_items.update(item.localId, {
          serverId: String(response.item_id),
          internalCode: response.internal_code ?? item.internalCode,
        })
      }

      await offlineDb.offline_items.update(item.localId, {
        serverId: String(created.id), status: 'synced',
        syncedAt: new Date().toISOString(), errorMessage: null,
      })
    } catch (error) {
      await offlineDb.offline_items.update(item.localId, {
        status: 'failed', errorMessage: errorMessage(error, 'فشل رفع الصنف'),
      })
    }
  }
}

async function syncPendingOperations() {
  for (const operation of await getPendingOperations()) {
    const claimedOperation = await claimPendingOperation(operation.id)
    if (!claimedOperation) continue
    try {
      if (!isInventoryTable(claimedOperation.tableName)) {
        throw new Error(`Unsupported inventory table: ${claimedOperation.tableName}`)
      }
      if (claimedOperation.operationType !== 'edit_item' && !isStockInventoryTable(claimedOperation.tableName)) {
        throw new Error(`Unsupported stock operation table: ${claimedOperation.tableName}`)
      }
      let itemId = claimedOperation.itemId
      if (!itemId && claimedOperation.localItemId) {
        const localItem = await offlineDb.offline_items.get(claimedOperation.localItemId)
        if (!localItem?.serverId) throw new Error('يجب رفع الصنف المحلي أولًا')
        itemId = localItem.serverId
      }
      if (!itemId) throw new Error('لا يوجد معرّف صالح للصنف')
      if (claimedOperation.operationType === 'edit_item') {
        const hasConflict = await syncEdit(claimedOperation, itemId)
        if (hasConflict) continue
      } else await syncStockOperation(claimedOperation, itemId)
      await offlineDb.offline_operations.update(claimedOperation.id, {
        status: 'synced', syncedAt: new Date().toISOString(), errorMessage: null,
      })
    } catch (error) {
      await offlineDb.offline_operations.update(claimedOperation.id, {
        status: 'failed', errorMessage: errorMessage(error, 'فشلت مزامنة العملية'),
      })
    }
  }
}

async function syncStockOperation(operation: OfflineOperation, itemId: string) {
  const client = requireClient()
  const p = operation.payload
  const { data, error } = await client.rpc('apply_inventory_operation_transactional_rpc', {
    p_table_name: operation.tableName, p_item_id: itemId,
    p_operation_type: operation.operationType, p_quantity: operation.quantity,
    p_operation_date: p.operationDate ?? getLocalDateString(),
    p_project_name: p.projectName ?? null, p_category_name: p.categoryName ?? null,
    p_item_name: p.itemName ?? null, p_supplier_name: p.supplierName ?? null,
    p_issued_to: p.issuedTo ?? null, p_received_by: p.receivedBy ?? p.issuedTo ?? null,
    p_purchase_order_number: p.purchaseOrderNumber ?? null, p_item_code: p.itemCode ?? null,
    p_notes: p.notes ?? null, p_created_by: p.createdBy ?? 'offline-user',
    p_request_id: operation.requestId,
  })
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object' || !('status' in data) || !['success', 'already_processed'].includes(String(data.status))) {
    throw new Error('رفض الخادم العملية')
  }
}

async function syncEdit(operation: OfflineOperation, itemId: string) {
  const client = requireClient()
  const patch = { ...operation.payload }
  delete patch.internal_code
  const isCustody = operation.tableName === 'cutting_discs' || operation.tableName === 'long_welding_gloves'
  const { data, error } = await client.rpc(
    isCustody
      ? 'update_custody_item_details_with_version_rpc'
      : 'update_inventory_item_details_with_version_rpc',
    isCustody
      ? {
          p_table_name: operation.tableName, p_item_id: itemId, p_patch: patch,
          p_base_updated_at: operation.baseUpdatedAt,
          p_updated_by: 'offline-user',
        }
      : {
          p_table_name: operation.tableName, p_item_id: itemId, p_patch: patch,
          p_base_updated_at: operation.baseUpdatedAt,
          p_adjust_date: null, p_notes: patch.notes ?? null,
          p_updated_by: 'offline-user',
        },
  )
  if (error) throw new Error(error.message)
  if (data && typeof data === 'object' && 'conflict' in data && data.conflict) {
    const reason = 'reason' in data && typeof data.reason === 'string' ? data.reason : 'stale_version'
    await offlineDb.offline_operations.update(operation.id, { status: 'conflict', errorMessage: reason })
    return true
  }
  return false
}
