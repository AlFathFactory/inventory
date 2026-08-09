import { useQuery } from '@tanstack/react-query'
import { categoryOptions } from '../../../config/categoryConfig'
import { isSupabaseConfigured } from '../../../lib/supabaseClient'
import { getDashboardData } from '../../../services/dashboardService'
import { inventoryKeys } from '../../inventory/inventoryQueryKeys'
import type { DashboardData } from '../types'

function createEmptyDashboardData(): DashboardData {
  return {
    stats: {
      totalCategories: categoryOptions.length,
      totalImportedFiles: 0,
      totalMainRows: 0,
      lowStockItemsCount: 0,
      outOfStockItemsCount: 0,
      lastImportedFile: null,
    },
    categoryCards: categoryOptions.map((category) => ({
      key: category.key,
      label: category.label,
      route: category.route,
      table: category.table,
      rowCount: 0,
    })),
    inventoryRows: [],
  }
}

export function useDashboardData() {
  const emptyData = createEmptyDashboardData()
  const query = useQuery({
    queryKey: inventoryKeys.dashboard(),
    queryFn: isSupabaseConfigured ? getDashboardData : async () => emptyData,
    placeholderData: emptyData,
    staleTime: 5 * 60_000,
  })

  return {
    data: query.data ?? emptyData,
    isLoading: query.isFetching && query.isPlaceholderData,
    error: query.error instanceof Error ? query.error.message : null,
  }
}
