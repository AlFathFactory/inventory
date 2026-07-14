import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import { usePagination } from '../../../hooks/usePagination'
import type { CategorySummaryItem } from '../../../services/itemsService'
import { filterCategoryRows, loadCategoryRows } from '../utils/categoryRows'

export function useCategoryRows(category: CategoryDefinition | null) {
  const [rows, setRows] = useState<CategorySummaryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const filteredRows = useMemo(
    () => filterCategoryRows(rows, deferredSearchTerm),
    [deferredSearchTerm, rows],
  )
  const pagination = usePagination(filteredRows, { initialPageSize: 10 })

  const refreshRows = useCallback(async () => {
    if (!category) return

    const result = await loadCategoryRows(category)
    if (result.error) {
      setError(result.error)
      return
    }

    setError(null)
    setRows(result.data)
  }, [category])

  useEffect(() => {
    if (!category) {
      setRows([])
      setError(null)
      setIsLoading(false)
      return
    }

    let isCancelled = false
    setIsLoading(true)
    setError(null)

    void loadCategoryRows(category).then((result) => {
      if (isCancelled) return
      setRows(result.error ? [] : result.data)
      setError(result.error)
      setIsLoading(false)
    })

    return () => {
      isCancelled = true
    }
  }, [category])

  return {
    rows,
    filteredRows,
    pagination,
    isLoading,
    error,
    searchTerm,
    setSearchTerm,
    refreshRows,
  }
}
