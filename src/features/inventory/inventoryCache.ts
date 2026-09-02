import type { QueryClient } from '@tanstack/react-query'
import { isCustodyTable } from '../../services/itemsService'
import { inventoryKeys } from './inventoryQueryKeys'
import { reportKeys } from '../reports/reportQueries'
import { partyKeys } from '../../services/partiesService'
import {
  custodyItemQueryOptions,
  itemQueryOptions,
  movementsQueryOptions,
} from './inventoryQueries'

export function prefetchInventoryItem(
  queryClient: QueryClient,
  tableName: string,
  itemId: string,
) {
  if (isCustodyTable(tableName)) {
    return queryClient.prefetchQuery(custodyItemQueryOptions(tableName, itemId))
  }

  return Promise.all([
    queryClient.prefetchQuery(itemQueryOptions(tableName, itemId)),
    queryClient.prefetchQuery(movementsQueryOptions(tableName, itemId)),
  ])
}

export async function invalidateCategoryData(
  queryClient: QueryClient,
  tableName: string,
) {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: inventoryKeys.category(tableName) }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.dashboard() }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.alerts() }),
  ]

  if (isCustodyTable(tableName)) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: inventoryKeys.custody(tableName) }),
    )
  }

  await Promise.all(invalidations)
}

export async function invalidateItemData(
  queryClient: QueryClient,
  tableName: string,
  itemId: string,
) {
  await Promise.all([
    invalidateCategoryData(queryClient, tableName),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.item(tableName, itemId) }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.movements(tableName, itemId) }),
    ...(tableName === 'raw_materials'
      ? [queryClient.invalidateQueries({
          queryKey: inventoryKeys.rawMaterialProjectHistory(itemId),
        })]
      : []),
    queryClient.invalidateQueries({ queryKey: reportKeys.all }),
    queryClient.invalidateQueries({ queryKey: partyKeys.all }),
    ...(isCustodyTable(tableName)
      ? [queryClient.invalidateQueries({
          queryKey: inventoryKeys.custodyItem(tableName, itemId),
        })]
      : []),
  ])
}

export function removeItemData(
  queryClient: QueryClient,
  tableName: string,
  itemId: string,
) {
  queryClient.removeQueries({ queryKey: inventoryKeys.item(tableName, itemId) })
  queryClient.removeQueries({ queryKey: inventoryKeys.movements(tableName, itemId) })

  if (isCustodyTable(tableName)) {
    queryClient.removeQueries({
      queryKey: inventoryKeys.custodyItem(tableName, itemId),
    })
  }
}
