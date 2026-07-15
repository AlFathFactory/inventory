import { v4 as uuid } from 'uuid'
import {
  offlineDb,
  type OfflineItem,
  type OfflineOperation,
  type OfflineOperationType,
} from '../lib/offlineDb'

export async function saveOfflineOperation(params: {
  tableName: string
  itemId?: string | number | null
  localItemId?: string | null
  operationType: OfflineOperationType
  quantity?: number | null
  payload: Record<string, unknown>
}) {
  const operation: OfflineOperation = {
    id: uuid(), tableName: params.tableName,
    itemId: params.itemId === null || params.itemId === undefined ? null : String(params.itemId),
    localItemId: params.localItemId ?? null,
    operationType: params.operationType, quantity: params.quantity ?? null,
    payload: params.payload, status: 'pending', errorMessage: null,
    createdAt: new Date().toISOString(), syncedAt: null,
  }
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
  const item: OfflineItem = {
    localId: uuid(), serverId: null, tableName: params.tableName,
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
export const retryFailedOperation = (id: string) => offlineDb.offline_operations.update(id, { status: 'pending', errorMessage: null })

export async function recoverInterruptedSyncs() {
  await offlineDb.transaction('rw', offlineDb.offline_items, offlineDb.offline_operations, async () => {
    await offlineDb.offline_items.where('status').equals('syncing').modify({ status: 'pending' })
    await offlineDb.offline_operations.where('status').equals('syncing').modify({ status: 'pending' })
  })
}
