import { useDeferredValue, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import { usePagination } from '../../../hooks/usePagination'
import type { CategorySummaryItem } from '../../../services/itemsService'
import { categoryQueryOptions } from '../../inventory/inventoryQueries'
import { filterCategoryRows } from '../utils/categoryRows'

const emptyCategoryRows: CategorySummaryItem[] = []

export function useCategoryRows(category: CategoryDefinition | null) {
  const [searchTerm, setSearchTerm] = useState('')
  const query = useQuery({
    ...(category
      ? categoryQueryOptions(category)
      : {
          queryKey: ['inventory', 'category', 'disabled'],
          queryFn: async () => [],
        }),
    enabled: Boolean(category),
  })
  const rows = query.data ?? emptyCategoryRows
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const filteredRows = useMemo(
    () => filterCategoryRows(rows, deferredSearchTerm),
    [deferredSearchTerm, rows],
  )
  const pagination = usePagination(filteredRows, { initialPageSize: 10 })

  return {
    rows,
    filteredRows,
    pagination,
    isLoading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
    searchTerm,
    setSearchTerm,
  }
}
