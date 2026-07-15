import { offlineDb, type OfflineOperation } from '../lib/offlineDb'
import { queryClient } from '../lib/queryClient'
import { supabaseClient } from '../lib/supabaseClient'
import { inventoryKeys } from '../features/inventory/inventoryQueryKeys'
import { getPendingItems, getPendingOperations, recoverInterruptedSyncs } from './offlineQueueService'
import { generateInventoryInternalCode } from './inventoryCodeService'

let activeSync: Promise<void> | null = null

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function requireClient() {
  if (!supabaseClient) throw new Error('Supabase غير مهيأ')
  return supabaseClient
}

export function syncOfflineData() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve()
  if (activeSync) return activeSync
  activeSync = performSync().finally(() => { activeSync = null })
  return activeSync
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
      await offlineDb.offline_items.update(item.localId, { status: 'syncing', errorMessage: null })
      const payload = { ...item.payload }
      delete payload.internal_code
      let created: Record<string, unknown>
      if (item.serverId) {
        const { data, error } = await client.from(item.tableName).select('*').eq('id', item.serverId).single()
        if (error || !data) throw new Error(error?.message ?? 'تعذر استكمال رفع الصنف')
        created = data as Record<string, unknown>
      } else {
        const { data, error: insertError } = await client
          .from(item.tableName).insert(payload as never).select('*').single()
        if (insertError || !data) throw new Error(insertError?.message ?? 'فشل رفع الصنف')
        created = data as Record<string, unknown>
        await offlineDb.offline_items.update(item.localId, { serverId: String(created.id) })
      }

      const internalCode = await generateInventoryInternalCode(item.tableName, created.id)
      await offlineDb.offline_items.update(item.localId, {
        serverId: String(created.id), internalCode, status: 'synced',
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
    try {
      await offlineDb.offline_operations.update(operation.id, { status: 'syncing', errorMessage: null })
      let itemId = operation.itemId
      if (!itemId && operation.localItemId) {
        const localItem = await offlineDb.offline_items.get(operation.localItemId)
        if (!localItem?.serverId) throw new Error('يجب رفع الصنف المحلي أولًا')
        itemId = localItem.serverId
      }
      if (!itemId) throw new Error('لا يوجد معرّف صالح للصنف')
      if (operation.operationType === 'edit_item') await syncEdit(operation, itemId)
      else await syncStockOperation(operation, itemId)
      await offlineDb.offline_operations.update(operation.id, {
        status: 'synced', syncedAt: new Date().toISOString(), errorMessage: null,
      })
    } catch (error) {
      await offlineDb.offline_operations.update(operation.id, {
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
    p_operation_date: p.operationDate ?? new Date().toISOString().slice(0, 10),
    p_project_name: p.projectName ?? null, p_category_name: p.categoryName ?? null,
    p_item_name: p.itemName ?? null, p_supplier_name: p.supplierName ?? null,
    p_issued_to: p.issuedTo ?? null, p_received_by: p.receivedBy ?? p.issuedTo ?? null,
    p_purchase_order_number: p.purchaseOrderNumber ?? null, p_item_code: p.itemCode ?? null,
    p_notes: p.notes ?? null, p_created_by: p.createdBy ?? 'offline-user',
  })
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object' || !('ok' in data) || !data.ok) throw new Error('رفض الخادم العملية')
}

async function syncEdit(operation: OfflineOperation, itemId: string) {
  const client = requireClient()
  const patch = { ...operation.payload }
  delete patch.internal_code
  if (operation.tableName === 'cutting_discs' || operation.tableName === 'long_welding_gloves') {
    const { error } = await client.from(operation.tableName).update(patch as never).eq('id', itemId)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await client.rpc('update_inventory_item_details_rpc', {
    p_table_name: operation.tableName, p_item_id: itemId, p_patch: patch,
    p_adjust_date: null, p_notes: patch.notes ?? null,
    p_updated_by: patch.updatedBy ?? 'offline-user',
  })
  if (error) throw new Error(error.message)
}
