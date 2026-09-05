import { queryOptions } from '@tanstack/react-query'
import type { CategoryDefinition } from '../../config/categoryConfig'
import {
  getCustodyRecord,
  getItemDetails,
  getItemMovements,
  type CustodyTableName,
} from '../../services/itemsService'
import { loadCategoryRows } from '../category/utils/categoryRows'
import { inventoryKeys } from './inventoryQueryKeys'
import {
  getCachedCategoryRows,
  getCachedInventoryItem,
} from '../../services/offlineBootstrapService'
import { offlineDb } from '../../lib/offlineDb'
import { projectOfflineChanges } from './offlineCache'
import { isTransportError } from '../../services/connectivityService'

async function getProjectedCachedCategoryRows(tableName: string) {
  const [rows, items, operations] = await Promise.all([
    getCachedCategoryRows(tableName),
    offlineDb.offline_items.where('tableName').equals(tableName).toArray(),
    offlineDb.offline_operations.where('tableName').equals(tableName).toArray(),
  ])
  return projectOfflineChanges(rows, items, operations)
}

export async function getProjectedCachedInventoryItem(tableName: string, itemId: string) {
  const [cachedItem, localItem, operations] = await Promise.all([
    getCachedInventoryItem(tableName, itemId),
    offlineDb.offline_items.get(itemId),
    offlineDb.offline_operations.where('tableName').equals(tableName).filter((operation) => (
      operation.itemId === itemId || operation.localItemId === itemId
    )).toArray(),
  ])
  const localItems = localItem?.tableName === tableName ? [localItem] : []
  return projectOfflineChanges(cachedItem ? [cachedItem] : [], localItems, operations)
    .find((row) => String(row.item_id) === itemId) ?? null
}

function requireData<T>(result: { data: T | null; error: string | null }): T {
  if (result.error || result.data === null) {
    throw new Error(result.error || 'Failed to load inventory data.')
  }

  return result.data
}

export function categoryQueryOptions(category: CategoryDefinition) {
  return queryOptions({
    queryKey: inventoryKeys.category(category.table),
    networkMode: 'always',
    queryFn: async () => {
      if (!navigator.onLine) return getCachedCategoryRows(category.table)
      try {
        return requireData(await loadCategoryRows(category))
      } catch (error) {
        if (isTransportError(error)) return getCachedCategoryRows(category.table)
        throw error
      }
    },
  })
}

export function itemQueryOptions(tableName: string, itemId: string) {
  return queryOptions({
    queryKey: inventoryKeys.item(tableName, itemId),
    networkMode: 'always',
    queryFn: async () => {
      if (navigator.onLine) {
        try {
          return requireData(await getItemDetails(tableName, itemId))
        } catch (error) {
          if (!isTransportError(error)) throw error
        }
      }
      const item = await getProjectedCachedInventoryItem(tableName, itemId)
      if (!item) throw new Error('الصنف غير موجود في البيانات المحلية')
      return item
    },
  })
}

export function movementsQueryOptions(tableName: string, itemId: string) {
  return queryOptions({
    queryKey: inventoryKeys.movements(tableName, itemId),
    networkMode: 'always',
    queryFn: async () => {
      if (!navigator.onLine) return []
      try {
        return requireData(await getItemMovements(tableName, itemId))
      } catch (error) {
        if (isTransportError(error)) return []
        throw error
      }
    },
  })
}

export function custodyItemQueryOptions(
  tableName: CustodyTableName,
  itemId: string,
) {
  return queryOptions({
    queryKey: inventoryKeys.custodyItem(tableName, itemId),
    networkMode: 'always',
    queryFn: async () => {
      if (navigator.onLine) {
        try {
          return requireData(await getCustodyRecord(tableName, itemId))
        } catch (error) {
          if (!isTransportError(error)) throw error
        }
      }
      const item = (await getProjectedCachedCategoryRows(tableName))
        .find((row) => String(row.item_id) === itemId)
      if (!item) throw new Error('سجل العهدة غير موجود في البيانات المحلية')
      return item
    },
  })
}
