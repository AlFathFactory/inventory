import { useDeferredValue, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { includesSearchTerm, normalizeSearchTerm } from '../../../utils/searchUtils'
import { useSearchParamsPagination } from '../../../hooks/useSearchParamsPagination'
import type { DashboardInventoryRow } from '../types'

export function useDashboardInventoryTable(rows: DashboardInventoryRow[]) {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = {
    searchTerm: searchParams.get('search') ?? '',
    categoryKey: searchParams.get('category') ?? 'all',
    projectName: searchParams.get('project') ?? 'all',
  }

  function updateFilter(name: 'search' | 'category' | 'project', value: string) {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams)
      const isDefaultValue = value === '' || value === 'all'
      nextParams.delete('page')

      if (isDefaultValue) {
        nextParams.delete(name)
      } else {
        nextParams.set(name, value)
      }

      return nextParams
    }, { replace: true })
  }

  const deferredSearchTerm = useDeferredValue(filters.searchTerm)
  const normalizedSearchTerm = normalizeSearchTerm(deferredSearchTerm)

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

      if (normalizedSearchTerm && !includesSearchTerm(row.searchText, normalizedSearchTerm)) {
        return false
      }

      return true
    })
  }, [filters.categoryKey, filters.projectName, normalizedSearchTerm, rows])

  const pagination = useSearchParamsPagination(filteredRows, { initialPageSize: 10 })

  return {
    filters,
    filteredRows,
    pagination,
    setSearchTerm: (searchTerm: string) => updateFilter('search', searchTerm),
    setCategoryKey: (categoryKey: string) => updateFilter('category', categoryKey),
    setProjectName: (projectName: string) => updateFilter('project', projectName),
    clearFilters: () => setSearchParams({}, { replace: true }),
  }
}
