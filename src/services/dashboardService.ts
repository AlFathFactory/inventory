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
import { getDynamicCategoryItemsRoute } from '../features/dynamic-categories/dynamicCategoryRoutes'
import type { InventoryRow } from './inventoryService'
import type { DashboardData } from '../features/dashboard/types'
import {
  buildDashboardInventoryRows,
  buildDynamicDashboardInventoryRows,
  getInventoryRowDateTimestamp,
} from '../features/dashboard/utils/dashboardInventoryRows'

type DynamicCategoryCount = {
  category_id: string
  category_name: string
  row_count: number
}

type DashboardRpcPayload = {
  total_imported_files?: number
  last_imported_file?: string | null
  category_counts?: Record<string, number>
  dynamic_category_counts?: DynamicCategoryCount[]
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
  const dynamicCategoryCounts = payload.dynamic_category_counts ?? []
  const inventoryRows = payload.inventory_rows ?? []
  const dynamicInventoryRows = inventoryRows.filter(
    (row) => row.table_name === 'inventory_items',
  )
  const groupedRows = categoryEntries.map(([categoryKey, category]) => ({
    categoryKey,
    category: category as CategoryDefinition,
    rows: inventoryRows.filter((row) => row.table_name === category.table),
  }))
  const legacyCategoryCards = categoryOptions.map((category) => ({
    key: category.key as string,
    label: category.label,
    route: category.route,
    table: category.table,
    rowCount: asNumber(categoryCounts[category.table]),
    categoryId: null,
  }))
  const dynamicCategoryCards = dynamicCategoryCounts.map((entry) => ({
    key: entry.category_id,
    label: entry.category_name,
    route: getDynamicCategoryItemsRoute(entry.category_id),
    table: 'inventory_items',
    rowCount: asNumber(entry.row_count),
    categoryId: entry.category_id,
  }))
  const categoryCards = [...legacyCategoryCards, ...dynamicCategoryCards]
  const legacyRows = buildDashboardInventoryRows(
    groupedRows as Array<{
      categoryKey: CategoryKey
      category: CategoryDefinition
      rows: InventoryRow[]
    }>,
  )
  const dynamicRows = buildDynamicDashboardInventoryRows(dynamicInventoryRows)
  const rows = [...legacyRows, ...dynamicRows].sort(
    (first, second) =>
      getInventoryRowDateTimestamp(second.updatedAt) -
      getInventoryRowDateTimestamp(first.updatedAt),
  )
  const lowStockItemsCount = rows.filter(
    (row) => row.status === 'low' || row.status === 'out',
  ).length
  const outOfStockItemsCount = rows.filter(
    (row) => row.status === 'out',
  ).length

  return {
    stats: {
      totalCategories: categoryOptions.length + dynamicCategoryCounts.length,
      totalImportedFiles: asNumber(payload.total_imported_files),
      totalMainRows: rows.length,
      lowStockItemsCount,
      outOfStockItemsCount,
      lastImportedFile: payload.last_imported_file ?? null,
    },
    categoryCards,
    inventoryRows: rows,
  }
}
