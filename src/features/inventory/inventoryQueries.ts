import { queryOptions } from '@tanstack/react-query'
import type { CategoryDefinition } from '../../config/categoryConfig'
import {
  getCustodyRecord,
  getItemDetails,
  getItemMovements,
  type CategorySummaryItem,
  type CustodyTableName,
  type ItemDetails,
  type ItemMovement,
} from '../../services/itemsService'
import { loadCategoryRows } from '../category/utils/categoryRows'
import { getInventoryRepository, getMovementsRepository } from '../../repositories'
import { readForRuntime } from '../../repositories/readStrategy'
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

/** Desktop reads are local-only: a repository failure surfaces, never falls back. */
function requireRepositoryData<T>(result: { data: T | null; error: string | null }): T {
  if (result.error !== null) throw new Error(result.error)
  if (result.data === null) throw new Error('لا توجد بيانات محلية')
  return result.data
}

export function categoryQueryOptions(category: CategoryDefinition) {
  return queryOptions({
    queryKey: inventoryKeys.category(category.table),
    networkMode: 'always',
    queryFn: () => readForRuntime<CategorySummaryItem[]>({
      desktop: async () => {
        const repository = await getInventoryRepository()
        return requireRepositoryData(await repository.listCategoryRows(category.table))
      },
      web: async () => {
        if (!navigator.onLine) return getCachedCategoryRows(category.table)
        try {
          return requireData(await loadCategoryRows(category))
        } catch (error) {
          if (isTransportError(error)) return getCachedCategoryRows(category.table)
          throw error
        }
      },
    }),
  })
}

export function itemQueryOptions(tableName: string, itemId: string) {
  return queryOptions({
    queryKey: inventoryKeys.item(tableName, itemId),
    networkMode: 'always',
    queryFn: () => readForRuntime<ItemDetails>({
      desktop: async () => {
        const repository = await getInventoryRepository()
        const result = await repository.getItemDetails(tableName, itemId)
        if (result.error !== null) throw new Error(result.error)
        if (result.data === null) throw new Error('الصنف غير موجود في البيانات المحلية')
        return result.data
      },
      web: async () => {
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
    }),
  })
}

export function movementsQueryOptions(tableName: string, itemId: string) {
  return queryOptions({
    queryKey: inventoryKeys.movements(tableName, itemId),
    networkMode: 'always',
    queryFn: () => readForRuntime<ItemMovement[]>({
      desktop: async () => {
        const repository = await getMovementsRepository()
        return requireRepositoryData(await repository.listItemMovements(tableName, itemId))
      },
      web: async () => {
        if (!navigator.onLine) return []
        try {
          return requireData(await getItemMovements(tableName, itemId))
        } catch (error) {
          if (isTransportError(error)) return []
          throw error
        }
      },
    }),
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
