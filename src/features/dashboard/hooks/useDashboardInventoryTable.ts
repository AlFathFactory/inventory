import { useDeferredValue, useMemo, useState } from 'react'
import { usePagination } from '../../../hooks/usePagination'
import type { DashboardInventoryRow } from '../types'

type DashboardInventoryFilters = {
  searchTerm: string
  categoryKey: string
  projectName: string
}

export function useDashboardInventoryTable(rows: DashboardInventoryRow[]) {
  const [filters, setFilters] = useState<DashboardInventoryFilters>({
    searchTerm: '',
    categoryKey: 'all',
    projectName: 'all',
  })

  const deferredSearchTerm = useDeferredValue(filters.searchTerm)
  const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase()

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (
        filters.categoryKey !== 'all' &&
        row.categoryKey !== filters.categoryKey
      ) {
        return false
      }

      if (
        filters.projectName !== 'all' &&
        row.projectName !== filters.projectName
      ) {
        return false
      }

      if (normalizedSearchTerm && !row.searchText.includes(normalizedSearchTerm)) {
        return false
      }

      return true
    })
  }, [filters.categoryKey, filters.projectName, normalizedSearchTerm, rows])

  const pagination = usePagination(filteredRows, { initialPageSize: 10 })

  return {
    filters,
    filteredRows,
    pagination,
    setSearchTerm: (searchTerm: string) =>
      setFilters((currentValue) => ({ ...currentValue, searchTerm })),
    setCategoryKey: (categoryKey: string) =>
      setFilters((currentValue) => ({ ...currentValue, categoryKey })),
    setProjectName: (projectName: string) =>
      setFilters((currentValue) => ({ ...currentValue, projectName })),
    clearFilters: () =>
      setFilters({
        searchTerm: '',
        categoryKey: 'all',
        projectName: 'all',
      }),
  }
}
