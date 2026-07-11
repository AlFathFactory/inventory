import { useDeferredValue, useMemo, useState } from 'react'
import { usePagination } from '../../../hooks/usePagination'
import type { DashboardInventoryRow } from '../types'
import { getInventoryRowDateTimestamp } from '../utils/dashboardInventoryRows'

type DashboardInventoryFilters = {
  searchTerm: string
  categoryKey: string
  fromDate: string
  toDate: string
}

function getInclusiveDateEndTimestamp(value: string) {
  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
}

export function useDashboardInventoryTable(rows: DashboardInventoryRow[]) {
  const [filters, setFilters] = useState<DashboardInventoryFilters>({
    searchTerm: '',
    categoryKey: 'all',
    fromDate: '',
    toDate: '',
  })

  const deferredSearchTerm = useDeferredValue(filters.searchTerm)
  const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase()

  const filteredRows = useMemo(() => {
    const fromTimestamp = filters.fromDate
      ? getInventoryRowDateTimestamp(filters.fromDate)
      : null
    const toTimestamp = filters.toDate
      ? getInclusiveDateEndTimestamp(filters.toDate)
      : null

    return rows.filter((row) => {
      if (
        filters.categoryKey !== 'all' &&
        row.categoryKey !== filters.categoryKey
      ) {
        return false
      }

      if (normalizedSearchTerm && !row.searchText.includes(normalizedSearchTerm)) {
        return false
      }

      if (fromTimestamp !== null || toTimestamp !== null) {
        const rowTimestamp = getInventoryRowDateTimestamp(row.dateValue)

        if (!rowTimestamp) {
          return false
        }

        if (fromTimestamp !== null && rowTimestamp < fromTimestamp) {
          return false
        }

        if (toTimestamp !== null && rowTimestamp > toTimestamp) {
          return false
        }
      }

      return true
    })
  }, [filters.categoryKey, filters.fromDate, filters.toDate, normalizedSearchTerm, rows])

  const pagination = usePagination(filteredRows, { initialPageSize: 10 })

  return {
    filters,
    filteredRows,
    pagination,
    setSearchTerm: (searchTerm: string) =>
      setFilters((currentValue) => ({ ...currentValue, searchTerm })),
    setCategoryKey: (categoryKey: string) =>
      setFilters((currentValue) => ({ ...currentValue, categoryKey })),
    setFromDate: (fromDate: string) =>
      setFilters((currentValue) => ({ ...currentValue, fromDate })),
    setToDate: (toDate: string) =>
      setFilters((currentValue) => ({ ...currentValue, toDate })),
    clearFilters: () =>
      setFilters({
        searchTerm: '',
        categoryKey: 'all',
        fromDate: '',
        toDate: '',
      }),
  }
}
