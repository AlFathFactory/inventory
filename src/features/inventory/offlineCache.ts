import type { QueryClient } from '@tanstack/react-query'
import type { CategorySummaryItem, ItemDetails } from '../../services/itemsService'
import type { OfflineItem, OfflineOperation } from '../../lib/offlineDb'
import { inventoryKeys } from './inventoryQueryKeys'

export function mapOfflineItemToRow(item: OfflineItem) {
  const payload = item.payload as Record<string, string | number | null>
  const row: CategorySummaryItem = {
    ...payload,
    table_name: item.tableName, category_name: '', item_id: item.localId,
    item_key: `offline:${item.localId}`, internal_code: item.internalCode,
    project_name: item.project, project: item.project,
    item_name: item.itemName, type_name: String(payload.type_name ?? item.itemName),
    stock_balance: Number(payload.stock_balance ?? payload.gas_balance ?? 0),
    min_quantity: Number(payload.min_quantity ?? 0), status: 'محفوظ محليًا',
    total_added: Number(payload.total_added ?? payload.stock_balance ?? 0), total_issued: 0,
    source_rows_count: 1, updated_at: item.createdAt, created_at: item.createdAt,
    offline_state: item.status === 'failed' ? 'failed' : 'local', local_id: item.localId,
  }
  return row
}

export function addOfflineItemToCache(queryClient: QueryClient, item: OfflineItem) {
  const row = mapOfflineItemToRow(item)
  queryClient.setQueryData<ItemDetails>(inventoryKeys.item(item.tableName, item.localId), row)
  return row
}

export function projectOfflineChanges(
  serverRows: CategorySummaryItem[],
  items: OfflineItem[],
  operations: OfflineOperation[],
) {
  const localRows = items
    .filter((item) => item.status !== 'synced')
    .map(mapOfflineItemToRow)
  const localIds = new Set(localRows.map((row) => String(row.item_id)))
  let rows = [...localRows, ...serverRows.filter((row) => !localIds.has(String(row.item_id)))]
  const unsyncedOperations = operations
    .filter((entry) => entry.status !== 'synced')
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  for (const operation of unsyncedOperations) {
    const targetId = operation.localItemId ?? operation.itemId
    if (!targetId) continue
    rows = rows.map((row) => {
      if (String(row.item_id) !== targetId) return row
      if (operation.operationType === 'edit_item') {
        return { ...row, ...operation.payload, offline_state: operation.status === 'failed' ? 'failed' : row.offline_state === 'local' ? 'local' : 'edited' }
      }
      const current = Number(row.stock_balance ?? row.gas_balance ?? 0)
      const quantity = Number(operation.quantity ?? 0)
      const balance = operation.operationType === 'add'
        ? current + quantity
        : operation.operationType === 'issue' ? current - quantity : quantity
      return { ...row, stock_balance: balance, ...(row.table_name === 'cylinders' ? { gas_balance: balance } : {}), offline_state: operation.status === 'failed' ? 'failed' : row.offline_state === 'local' ? 'local' : 'pending' }
    })
  }
  return rows
}
