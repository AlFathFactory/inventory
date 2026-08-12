import { useQuery } from '@tanstack/react-query'
import { categoryEntries } from '../../../config/categoryConfig'
import { isSupabaseConfigured } from '../../../lib/supabaseClient'
import { getDynamicLowStockRows, getExpiryAlertRows, getLowStockRows, getOutOfStockRows } from '../../../services/inventoryService'
import { inventoryKeys } from '../../inventory/inventoryQueryKeys'
import type { AlertStatus, LowStockState } from '../types'
import { hasOnlyStockField, hasStockConfig, mapDynamicLowStockRows, mapExpiryRows, mapLowStockRows, mapOutOfStockRows } from '../utils/lowStockRows'

const priority: Record<AlertStatus, number> = { expired: 0, out: 1, expiring: 2, low: 3 }

export function useLowStockAlerts(): LowStockState {
  const alertsQuery = useQuery({
    queryKey: inventoryKeys.alerts(),
    queryFn: async (): Promise<LowStockState> => {
      if (!isSupabaseConfigured) return { rows: [], isLoading: false, error: null }
      const requests = categoryEntries.reduce<Array<Promise<{ rows: LowStockState['rows']; error: string | null }>>>((promises, [categoryKey, category]) => {
        if (hasStockConfig(category)) {
          promises.push((async () => {
            const result = await getLowStockRows(category.table, category.stockField, category.minQuantityField)
            return { rows: result.data ? mapLowStockRows(categoryKey, category, result.data) : [], error: result.error ? `فشل تحميل جدول ${category.label}: ${result.error}` : null }
          })())
        } else if (hasOnlyStockField(category)) {
          promises.push((async () => {
            const result = await getOutOfStockRows(category.table, category.stockField)
            return { rows: result.data ? mapOutOfStockRows(categoryKey, category, result.data) : [], error: result.error ? `فشل تحميل جدول ${category.label}: ${result.error}` : null }
          })())
        }
        return promises
      }, [])
      requests.push((async () => {
        const result = await getExpiryAlertRows('paints', 'expire_date')
        return { rows: result.data ? mapExpiryRows(result.data) : [], error: result.error ? `فشل تحميل تنبيهات صلاحية الدهانات: ${result.error}` : null }
      })())
      requests.push((async () => {
        const result = await getDynamicLowStockRows()
        return { rows: result.data ? mapDynamicLowStockRows(result.data) : [], error: result.error ? `فشل تحميل تنبيهات الأصناف الديناميكية: ${result.error}` : null }
      })())
      const results = await Promise.all(requests)
      return { rows: results.flatMap((result) => result.rows).sort((a, b) => priority[a.status] !== priority[b.status] ? priority[a.status] - priority[b.status] : b.id.localeCompare(a.id)), isLoading: false, error: results.map((result) => result.error).filter((value): value is string => Boolean(value)).join(' | ') || null }
    },
  })
  return { rows: alertsQuery.data?.rows ?? [], isLoading: alertsQuery.isPending, error: alertsQuery.error instanceof Error ? alertsQuery.error.message : alertsQuery.data?.error ?? null }
}
