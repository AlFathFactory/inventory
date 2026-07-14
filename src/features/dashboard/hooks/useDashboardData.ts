import { useQuery } from '@tanstack/react-query'
import { categoryOptions } from '../../../config/categoryConfig'
import { isSupabaseConfigured } from '../../../lib/supabaseClient'
import { getDashboardData } from '../../../services/dashboardService'
import { inventoryKeys } from '../../inventory/inventoryQueryKeys'
import { dashboardDemo } from '../data/dashboardDemo'
import type { DashboardData } from '../types'

function createFallbackData(): DashboardData {
  return {
    ...dashboardDemo,
    categoryCards: categoryOptions.map((category) => ({
      key: category.key,
      label: category.label,
      route: category.route,
      table: category.table,
      rowCount: 0,
    })),
    isDemo: true,
  }
}

export function useDashboardData() {
  const fallbackData = createFallbackData()
  const query = useQuery({
    queryKey: inventoryKeys.dashboard(),
    queryFn: isSupabaseConfigured
      ? async () => {
          const data = await getDashboardData()
          return data.isDemo
            ? { ...fallbackData, categoryCards: data.categoryCards }
            : data
        }
      : async () => fallbackData,
    placeholderData: fallbackData,
  })

  return {
    data: query.data ?? fallbackData,
    isLoading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
  }
}
