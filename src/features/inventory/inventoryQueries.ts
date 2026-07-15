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
import { getCachedCategoryRows } from '../../services/offlineBootstrapService'
import { offlineDb } from '../../lib/offlineDb'
import { projectOfflineChanges } from './offlineCache'

async function getProjectedCachedCategoryRows(tableName: string) {
  const [rows, items, operations] = await Promise.all([
    getCachedCategoryRows(tableName),
    offlineDb.offline_items.where('tableName').equals(tableName).toArray(),
    offlineDb.offline_operations.where('tableName').equals(tableName).toArray(),
  ])
  return projectOfflineChanges(rows, items, operations)
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
    queryFn: async () => navigator.onLine
      ? requireData(await loadCategoryRows(category))
      : getCachedCategoryRows(category.table),
  })
}

export function itemQueryOptions(tableName: string, itemId: string) {
  return queryOptions({
    queryKey: inventoryKeys.item(tableName, itemId),
    queryFn: async () => {
      if (navigator.onLine) return requireData(await getItemDetails(tableName, itemId))
      const item = (await getProjectedCachedCategoryRows(tableName))
        .find((row) => String(row.item_id) === itemId)
      if (!item) throw new Error('الصنف غير موجود في البيانات المحلية')
      return item
    },
  })
}

export function movementsQueryOptions(tableName: string, itemId: string) {
  return queryOptions({
    queryKey: inventoryKeys.movements(tableName, itemId),
    queryFn: async () => navigator.onLine
      ? requireData(await getItemMovements(tableName, itemId))
      : [],
  })
}

export function custodyItemQueryOptions(
  tableName: CustodyTableName,
  itemId: string,
) {
  return queryOptions({
    queryKey: inventoryKeys.custodyItem(tableName, itemId),
    queryFn: async () => {
      if (navigator.onLine) return requireData(await getCustodyRecord(tableName, itemId))
      const item = (await getProjectedCachedCategoryRows(tableName))
        .find((row) => String(row.item_id) === itemId)
      if (!item) throw new Error('سجل العهدة غير موجود في البيانات المحلية')
      return item
    },
  })
}
