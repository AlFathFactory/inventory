import {
  offlineDb,
  type OfflineItem,
  type OfflineOperation,
  type OfflineOperationType,
} from '../lib/offlineDb'
import { isInventoryTable, isStockInventoryTable } from './inventoryTablePolicy'

export type SaveOfflineOperationParams = {
  requestId?: string
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
    id: crypto.randomUUID(), requestId: params.requestId ?? crypto.randomUUID(), tableName: params.tableName,
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
    localId: crypto.randomUUID(), requestId: crypto.randomUUID(), serverId: null, tableName: params.tableName,
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

export async function discardOfflineOperation(id: string) {
  return offlineDb.transaction('rw', offlineDb.offline_operations, async () => {
    const operation = await offlineDb.offline_operations.get(id)
    if (!operation || operation.status === 'syncing' || operation.status === 'synced') return 0
    await offlineDb.offline_operations.delete(id)
    return 1
  })
}

export async function discardOfflineItem(localId: string) {
  return offlineDb.transaction(
    'rw',
    offlineDb.offline_items,
    offlineDb.offline_operations,
    async () => {
      const item = await offlineDb.offline_items.get(localId)
      if (!item || item.status === 'syncing' || item.status === 'synced') {
        return { discarded: false, discardedOperationCount: 0 }
      }

      const dependentOperations = await offlineDb.offline_operations
        .where('localItemId')
        .equals(localId)
        .toArray()
      if (dependentOperations.some((operation) => operation.status === 'syncing')) {
        return { discarded: false, discardedOperationCount: 0 }
      }

      const operationIds = dependentOperations
        .filter((operation) => operation.status !== 'synced')
        .map((operation) => operation.id)
      await offlineDb.offline_operations.bulkDelete(operationIds)
      await offlineDb.offline_items.delete(localId)
      return {
        discarded: true,
        discardedOperationCount: operationIds.length,
      }
    },
  )
}

export async function recoverInterruptedSyncs() {
  await offlineDb.transaction('rw', offlineDb.offline_items, offlineDb.offline_operations, async () => {
    await offlineDb.offline_items.where('status').equals('syncing').modify({ status: 'pending' })
    await offlineDb.offline_operations.where('status').equals('syncing').modify({ status: 'pending' })

    // A tab can close after the server item ID is saved but before its dependent
    // operations are released. Repair that small crash window on every upload.
    const blockedOperations = await offlineDb.offline_operations
      .where('status')
      .equals('blocked')
      .toArray()
    for (const operation of blockedOperations) {
      if (!operation.localItemId) continue
      const item = await offlineDb.offline_items.get(operation.localItemId)
      if (item?.serverId) {
        await offlineDb.offline_operations.update(operation.id, {
          status: 'pending',
          errorMessage: null,
        })
      }
    }
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

export async function releaseBlockedOperations(localItemId: string) {
  return offlineDb.offline_operations
    .where('localItemId')
    .equals(localItemId)
    .and((operation) => operation.status === 'blocked')
    .modify({ status: 'pending', errorMessage: null })
}

export async function updateOperationParties(
  id: string,
  partyPayload: Record<string, unknown>,
) {
  return offlineDb.transaction('rw', offlineDb.offline_operations, async () => {
    const operation = await offlineDb.offline_operations.get(id)
    if (!operation || operation.status === 'syncing' || operation.status === 'synced') return 0
    return offlineDb.offline_operations.update(id, {
      payload: { ...operation.payload, ...partyPayload },
      status: 'pending',
      errorMessage: null,
    })
  })
}

export async function cleanupSyncedQueue(options: { retentionDays?: number; keepLatest?: number } = {}) {
  const retentionDays = options.retentionDays ?? 7
  const keepLatest = options.keepLatest ?? 100
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000

  await offlineDb.transaction('rw', offlineDb.offline_items, offlineDb.offline_operations, async () => {
    const [items, operations, unresolvedOperations] = await Promise.all([
      offlineDb.offline_items.where('status').equals('synced').toArray(),
      offlineDb.offline_operations.where('status').equals('synced').toArray(),
      offlineDb.offline_operations.filter((operation) => operation.status !== 'synced').toArray(),
    ])
    items.sort((a, b) => Date.parse(b.syncedAt ?? '') - Date.parse(a.syncedAt ?? ''))
    operations.sort((a, b) => Date.parse(b.syncedAt ?? '') - Date.parse(a.syncedAt ?? ''))
    const protectedLocalItemIds = new Set(
      unresolvedOperations
        .map((operation) => operation.localItemId)
        .filter((localId): localId is string => Boolean(localId)),
    )
    const itemIds = items
      .slice(keepLatest)
      .filter((item) => (
        !protectedLocalItemIds.has(item.localId) &&
        item.syncedAt &&
        new Date(item.syncedAt).getTime() < cutoff
      ))
      .map((item) => item.localId)
    const operationIds = operations
      .slice(keepLatest)
      .filter((operation) => operation.syncedAt && new Date(operation.syncedAt).getTime() < cutoff)
      .map((operation) => operation.id)
    await Promise.all([
      offlineDb.offline_items.bulkDelete(itemIds),
      offlineDb.offline_operations.bulkDelete(operationIds),
    ])
  })
}
