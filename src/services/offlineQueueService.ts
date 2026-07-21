import {
  offlineDb,
  type OfflineItem,
  type OfflineOperation,
  type OfflineOperationType,
} from '../lib/offlineDb'
import { isInventoryTable, isStockInventoryTable } from './inventoryTablePolicy'

export type SaveOfflineOperationParams = {
  tableName: string
  itemId?: string | number | null
  localItemId?: string | null
  operationType: OfflineOperationType
  quantity?: number | null
  baseUpdatedAt?: string | null
  payload: Record<string, unknown>
}

export function createOfflineOperation(params: SaveOfflineOperationParams): OfflineOperation {
  return {
    id: crypto.randomUUID(), requestId: crypto.randomUUID(), tableName: params.tableName,
    itemId: params.itemId === null || params.itemId === undefined ? null : String(params.itemId),
    localItemId: params.localItemId ?? null,
    operationType: params.operationType, quantity: params.quantity ?? null,
    baseUpdatedAt: params.baseUpdatedAt ?? null,
    payload: params.payload, status: 'pending', errorMessage: null,
    createdAt: new Date().toISOString(), syncedAt: null,
  }
}

export async function saveOfflineOperation(params: SaveOfflineOperationParams) {
  if (!isStockInventoryTable(params.tableName)) {
    throw new Error(`Unsupported offline stock table: ${params.tableName}`)
  }

  const operation = createOfflineOperation(params)
  await offlineDb.offline_operations.add(operation)
  return operation
}

export async function saveOfflineItem(params: {
  tableName: string
  internalCode: string
  itemName: string
  project?: string | null
  materialSource?: string | null
  payload: Record<string, unknown>
}) {
  if (!isInventoryTable(params.tableName)) {
    throw new Error(`Unsupported offline inventory table: ${params.tableName}`)
  }

  const item: OfflineItem = {
    localId: crypto.randomUUID(), serverId: null, tableName: params.tableName,
    internalCode: params.internalCode, itemName: params.itemName,
    project: params.project ?? null, materialSource: params.materialSource ?? null,
    payload: params.payload, status: 'pending', errorMessage: null,
    createdAt: new Date().toISOString(), syncedAt: null,
  }
  await offlineDb.offline_items.add(item)
  return item
}

export const getPendingItems = () => offlineDb.offline_items.where('status').equals('pending').sortBy('createdAt')
export const getPendingOperations = () => offlineDb.offline_operations.where('status').equals('pending').sortBy('createdAt')
export const retryFailedItem = (localId: string) => offlineDb.offline_items.update(localId, { status: 'pending', errorMessage: null })
export async function retryFailedOperation(id: string) {
  return offlineDb.transaction('rw', offlineDb.offline_operations, async () => {
    const operation = await offlineDb.offline_operations.get(id)
    if (!operation || operation.status === 'syncing' || operation.status === 'synced') return 0
    return offlineDb.offline_operations.update(id, { status: 'pending', errorMessage: null })
  })
}
export const dismissConflictingOperation = (id: string) => offlineDb.offline_operations.update(id, {
  status: 'synced',
  errorMessage: 'Local edit discarded after a server-version conflict.',
  syncedAt: new Date().toISOString(),
})

export async function recoverInterruptedSyncs() {
  await offlineDb.transaction('rw', offlineDb.offline_items, offlineDb.offline_operations, async () => {
    await offlineDb.offline_items.where('status').equals('syncing').modify({ status: 'pending' })
    await offlineDb.offline_operations.where('status').equals('syncing').modify({ status: 'pending' })
  })
}

export async function claimPendingOperation(id: string) {
  return offlineDb.transaction('rw', offlineDb.offline_operations, async () => {
    const operation = await offlineDb.offline_operations.get(id)
    if (!operation || operation.status !== 'pending') return null
    await offlineDb.offline_operations.update(id, { status: 'syncing', errorMessage: null })
    return { ...operation, status: 'syncing' as const, errorMessage: null }
  })
}
