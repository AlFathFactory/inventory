import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import {
  getInventoryReport,
  type InventoryReportFilters,
} from '../../services/operationsService'
import { normalizeSearchTerm } from '../../utils/searchUtils'

export const reportKeys = {
  all: ['reports'] as const,
  inventoryOperations: (filters: InventoryReportFilters) =>
    [
      'reports',
      'inventory-operations',
      filters.fromDate ?? '',
      filters.toDate ?? '',
      filters.categoryName ?? '',
      filters.projectName ?? '',
      normalizeSearchTerm(filters.searchTerm ?? ''),
      filters.operationType,
      filters.page,
      filters.pageSize,
    ] as const,
}

export function inventoryReportQueryOptions(filters: InventoryReportFilters) {
  return queryOptions({
    queryKey: reportKeys.inventoryOperations(filters),
    queryFn: () => getInventoryReport(filters),
    placeholderData: keepPreviousData,
  })
}

export function useInventoryReport(
  filters: InventoryReportFilters,
  enabled = true,
) {
  return useQuery({ ...inventoryReportQueryOptions(filters), enabled })
}
