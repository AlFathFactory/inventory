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

function requireData<T>(result: { data: T | null; error: string | null }): T {
  if (result.error || result.data === null) {
    throw new Error(result.error || 'Failed to load inventory data.')
  }

  return result.data
}

export function categoryQueryOptions(category: CategoryDefinition) {
  return queryOptions({
    queryKey: inventoryKeys.category(category.table),
    queryFn: async () => requireData(await loadCategoryRows(category)),
  })
}

export function itemQueryOptions(tableName: string, itemId: string) {
  return queryOptions({
    queryKey: inventoryKeys.item(tableName, itemId),
    queryFn: async () => requireData(await getItemDetails(tableName, itemId)),
  })
}

export function movementsQueryOptions(tableName: string, itemId: string) {
  return queryOptions({
    queryKey: inventoryKeys.movements(tableName, itemId),
    queryFn: async () => requireData(await getItemMovements(tableName, itemId)),
  })
}

export function custodyItemQueryOptions(
  tableName: CustodyTableName,
  itemId: string,
) {
  return queryOptions({
    queryKey: inventoryKeys.custodyItem(tableName, itemId),
    queryFn: async () => requireData(await getCustodyRecord(tableName, itemId)),
  })
}
