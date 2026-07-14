import {
  categoryEntries,
  categoryOptions,
  type CategoryDefinition,
  type CategoryKey,
} from '../config/categoryConfig'
import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'
import type { InventoryRow } from './inventoryService'
import type { DashboardData } from '../features/dashboard/types'
import { buildDashboardInventoryRows } from '../features/dashboard/utils/dashboardInventoryRows'

type DashboardRpcPayload = {
  total_items?: number
  low_stock_count?: number
  out_of_stock_count?: number
  total_imported_files?: number
  last_imported_file?: string | null
  category_counts?: Record<string, number>
  inventory_rows?: InventoryRow[]
}

function asNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured || !supabaseClient) {
    throw new Error(getSupabaseConfigError())
  }

  const { data, error } = await supabaseClient.rpc(
    'get_inventory_dashboard_summary_rpc',
  )

  if (error) {
    throw new Error(error.message)
  }

  const payload = (data ?? {}) as DashboardRpcPayload
  const categoryCounts = payload.category_counts ?? {}
  const inventoryRows = payload.inventory_rows ?? []
  const groupedRows = categoryEntries.map(([categoryKey, category]) => ({
    categoryKey,
    category: category as CategoryDefinition,
    rows: inventoryRows.filter((row) => row.table_name === category.table),
  }))
  const categoryCards = categoryOptions.map((category) => ({
    key: category.key,
    label: category.label,
    route: category.route,
    table: category.table,
    rowCount: asNumber(categoryCounts[category.table]),
  }))
  const rows = buildDashboardInventoryRows(
    groupedRows as Array<{
      categoryKey: CategoryKey
      category: CategoryDefinition
      rows: InventoryRow[]
    }>,
  )

  return {
    stats: {
      totalCategories: categoryOptions.length,
      totalImportedFiles: asNumber(payload.total_imported_files),
      totalMainRows: asNumber(payload.total_items),
      lowStockItemsCount: asNumber(payload.low_stock_count),
      outOfStockItemsCount: asNumber(payload.out_of_stock_count),
      lastImportedFile: payload.last_imported_file ?? null,
    },
    categoryCards,
    inventoryRows: rows,
  }
}
