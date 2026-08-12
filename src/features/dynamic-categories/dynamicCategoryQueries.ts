import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { inventoryKeys } from '../inventory/inventoryQueryKeys'
import { reportKeys } from '../reports/reportQueries'
import { partyKeys } from '../../services/partiesService'
import {
  createDynamicCategory,
  createDynamicInventoryItem,
  getDynamicCategory,
  getDynamicItem,
  listDynamicCategories,
  listDynamicCategoryItems,
  listDynamicItemMovements,
  renameDynamicCategory,
  setDynamicCategoryArchived,
  setDynamicInventoryItemArchived,
  updateDynamicInventoryItem,
} from './dynamicCategoryService'
import type { DynamicItemCreateInput, DynamicItemEditInput, DynamicItemFilters } from './types'

export const dynamicCategoryKeys = {
  all: ['dynamic-categories'] as const,
  detail: (categoryId: string) => ['dynamic-category', categoryId] as const,
  itemsRoot: (categoryId: string) => ['dynamic-category-items', categoryId] as const,
  items: (categoryId: string, filters: DynamicItemFilters) =>
    ['dynamic-category-items', categoryId, filters] as const,
  item: (itemId: string) => ['dynamic-item', itemId] as const,
  movements: (itemId: string) => ['dynamic-item-movements', itemId] as const,
}

export const dynamicCategoriesQueryOptions = queryOptions({
  queryKey: dynamicCategoryKeys.all,
  queryFn: listDynamicCategories,
})

export function dynamicCategoryQueryOptions(categoryId: string) {
  return queryOptions({
    queryKey: dynamicCategoryKeys.detail(categoryId),
    queryFn: () => getDynamicCategory(categoryId),
    enabled: Boolean(categoryId),
  })
}

export function dynamicCategoryItemsQueryOptions(
  categoryId: string,
  filters: DynamicItemFilters,
) {
  return queryOptions({
    queryKey: dynamicCategoryKeys.items(categoryId, filters),
    queryFn: () => listDynamicCategoryItems(categoryId, filters),
    enabled: Boolean(categoryId),
  })
}

export function dynamicItemQueryOptions(itemId: string, categoryId: string) {
  return queryOptions({
    queryKey: dynamicCategoryKeys.item(itemId),
    queryFn: () => getDynamicItem(itemId, categoryId),
    enabled: Boolean(itemId && categoryId),
  })
}

export function dynamicItemMovementsQueryOptions(itemId: string) {
  return queryOptions({
    queryKey: dynamicCategoryKeys.movements(itemId),
    queryFn: () => listDynamicItemMovements(itemId),
    enabled: Boolean(itemId),
  })
}

export function useCreateDynamicCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createDynamicCategory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.all })
    },
  })
}

export function useRenameDynamicCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      renameDynamicCategory(categoryId, name),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.all }),
        queryClient.invalidateQueries({
          queryKey: dynamicCategoryKeys.detail(variables.categoryId),
        }),
      ])
    },
  })
}

export function useSetDynamicCategoryArchived() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ categoryId, isArchived }: { categoryId: string; isArchived: boolean }) =>
      setDynamicCategoryArchived(categoryId, isArchived),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.all }),
        queryClient.invalidateQueries({
          queryKey: dynamicCategoryKeys.detail(variables.categoryId),
        }),
      ])
    },
  })
}

export function useCreateDynamicItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: DynamicItemCreateInput) => createDynamicInventoryItem(input),
    onSettled: async (_, __, variables) => {
      if (!variables) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.detail(variables.categoryId) }),
        queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.itemsRoot(variables.categoryId) }),
      ])
    },
  })
}

export function useUpdateDynamicItem(categoryId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: DynamicItemEditInput }) =>
      updateDynamicInventoryItem(itemId, input),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.item(variables.itemId) }),
        queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.itemsRoot(categoryId) }),
      ])
    },
  })
}

export function useSetDynamicItemArchived(categoryId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ itemId, isArchived }: { itemId: string; isArchived: boolean }) =>
      setDynamicInventoryItemArchived(itemId, isArchived),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.detail(categoryId) }),
        queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.item(variables.itemId) }),
        queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.itemsRoot(categoryId) }),
      ])
    },
  })
}

export async function invalidateDynamicItemStockData(
  queryClient: QueryClient,
  categoryId: string,
  itemId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.item(itemId) }),
    queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.movements(itemId) }),
    queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.itemsRoot(categoryId) }),
    queryClient.invalidateQueries({ queryKey: dynamicCategoryKeys.all }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.dashboard() }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.alerts() }),
    queryClient.invalidateQueries({ queryKey: reportKeys.all }),
    queryClient.invalidateQueries({ queryKey: partyKeys.all }),
  ])
}
