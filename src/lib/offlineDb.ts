import Dexie, { type EntityTable } from 'dexie'

export type OfflineStatus = 'pending' | 'syncing' | 'synced' | 'failed'
export type OfflineOperationType = 'add' | 'issue' | 'adjust' | 'edit_item'

export interface OfflineOperation {
  id: string
  tableName: string
  itemId: string | null
  localItemId: string | null
  operationType: OfflineOperationType
  quantity: number | null
  payload: Record<string, unknown>
  status: OfflineStatus
  errorMessage: string | null
  createdAt: string
  syncedAt: string | null
}

export interface OfflineItem {
  localId: string
  serverId: string | null
  tableName: string
  internalCode: string
  itemName: string
  project: string | null
  materialSource: string | null
  payload: Record<string, unknown>
  status: OfflineStatus
  errorMessage: string | null
  createdAt: string
  syncedAt: string | null
}

export interface CachedInventoryItem {
  id: string
  tableName: string
  itemId: string
  internalCode: string | null
  itemName: string | null
  projectName: string | null
  materialSource: string | null
  stockBalance: number | null
  minQuantity: number | null
  supplierName: string | null
  raw: Record<string, unknown>
  updatedAt: string | null
  cachedAt: string
}

export interface CachedProject {
  id: string
  name: string
  code: string | null
  status: string
  raw: Record<string, unknown>
  cachedAt: string
}

export type OfflineCachePreparationStatus = 'ready' | 'not_ready' | 'preparing' | 'failed'

export interface OfflineCacheMetadata {
  key: 'bootstrap'
  status: OfflineCachePreparationStatus
  updatedAt: string | null
  errorMessage: string | null
}

class OfflineInventoryDatabase extends Dexie {
  offline_items!: EntityTable<OfflineItem, 'localId'>
  offline_operations!: EntityTable<OfflineOperation, 'id'>
  cached_inventory_items!: EntityTable<CachedInventoryItem, 'id'>
  cached_projects!: EntityTable<CachedProject, 'id'>
  offline_cache_metadata!: EntityTable<OfflineCacheMetadata, 'key'>

  constructor() {
    super('offline_inventory_db')
    this.version(1).stores({
      offline_items: 'localId, serverId, tableName, internalCode, status, createdAt',
      offline_operations: 'id, tableName, itemId, localItemId, operationType, status, createdAt',
    })
    this.version(2).stores({
      offline_items: 'localId, serverId, tableName, internalCode, status, createdAt',
      offline_operations: 'id, tableName, itemId, localItemId, operationType, status, createdAt',
      cached_inventory_items: 'id, [tableName+itemId], tableName, itemId, internalCode, projectName, cachedAt',
      cached_projects: 'id, name, code, status, cachedAt',
      offline_cache_metadata: 'key, status, updatedAt',
    })
  }
}

export const offlineDb = new OfflineInventoryDatabase()
