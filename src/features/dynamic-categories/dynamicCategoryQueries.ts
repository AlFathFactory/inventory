import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createDynamicCategory,
  getDynamicCategory,
  listDynamicCategories,
  listDynamicCategoryItems,
  renameDynamicCategory,
  setDynamicCategoryArchived,
} from './dynamicCategoryService'

export const dynamicCategoryKeys = {
  all: ['dynamic-categories'] as const,
  detail: (categoryId: string) => ['dynamic-category', categoryId] as const,
  items: (categoryId: string) => ['dynamic-category', categoryId, 'items'] as const,
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

export function dynamicCategoryItemsQueryOptions(categoryId: string) {
  return queryOptions({
    queryKey: dynamicCategoryKeys.items(categoryId),
    queryFn: () => listDynamicCategoryItems(categoryId),
    enabled: Boolean(categoryId),
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
