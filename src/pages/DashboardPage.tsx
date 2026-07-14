import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { DashboardInventoryFilters } from '../features/dashboard/components/DashboardInventoryFilters'
import { DashboardInventoryTable } from '../features/dashboard/components/DashboardInventoryTable'
import { DashboardStatCard } from '../features/dashboard/components/DashboardStatCard'
import { DashboardTableSection } from '../features/dashboard/components/DashboardTableSection'
import { useDashboardData } from '../features/dashboard/hooks/useDashboardData'
import { useDashboardInventoryTable } from '../features/dashboard/hooks/useDashboardInventoryTable'
import { getItemDetailsRoute } from '../features/items/itemRoutes'
import {
  getSupabaseConfigError,
  isSupabaseConfigured,
} from '../lib/supabaseClient'
import { categoryConfig } from '../config/categoryConfig'
import { prefetchInventoryItem } from '../features/inventory/inventoryCache'

export function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useDashboardData()
  const inventoryTable = useDashboardInventoryTable(data.inventoryRows)
  const configError = !isSupabaseConfigured ? getSupabaseConfigError() : null

  return (
    <section className="relative space-y-8" aria-busy={isLoading}>
      {isLoading ? (
        <div
          className="absolute inset-0 z-50 flex min-h-[70vh] items-center justify-center rounded-[28px] bg-white/35 backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 px-6 py-4 text-sm font-semibold text-slate-700 shadow-xl">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" aria-hidden="true" />
            <span>جاري تحميل بيانات لوحة التحكم...</span>
          </div>
        </div>
      ) : null}

      {configError ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Supabase is not configured for this deployment. {configError}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          caption="إجمالي الأقسام"
          value={data.stats.totalCategories}
          helper="كل أقسام المخزن"
          accentClassName="text-blue-600"
        />
        <DashboardStatCard
          caption="إجمالي الأصناف"
          value={data.stats.totalMainRows.toLocaleString()}
          helper="من آخر تحديث"
          accentClassName="text-blue-600"
        />
        <DashboardStatCard
          caption="أصناف قليلة"
          value={data.stats.lowStockItemsCount}
          helper="أقل من الحد الأدنى"
          accentClassName="text-amber-500"
        />
        <DashboardStatCard
          caption="أصناف منتهية"
          value={data.stats.outOfStockItemsCount}
          helper="رصيدها صفر"
          accentClassName="text-red-500"
        />
      </div>

      <DashboardTableSection
        title="جدول البحث الشامل"
      >
        <div className="space-y-5 p-4 md:p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                ابحث داخل جميع أصناف المخزن من مكان واحد
              </p>
              <p className="text-sm text-[var(--app-text-muted)]">
                يمكنك التصفية بالقسم أو التاريخ والبحث النصي في كل الصفوف.
              </p>
            </div>
            <p className="text-sm text-slate-500">
              النتائج: {inventoryTable.filteredRows.length}
            </p>
          </div>

          <DashboardInventoryFilters
            searchValue={inventoryTable.filters.searchTerm}
            categoryValue={inventoryTable.filters.categoryKey}
            fromDate={inventoryTable.filters.fromDate}
            toDate={inventoryTable.filters.toDate}
            onSearchChange={inventoryTable.setSearchTerm}
            onCategoryChange={inventoryTable.setCategoryKey}
            onFromDateChange={inventoryTable.setFromDate}
            onToDateChange={inventoryTable.setToDate}
            onClear={inventoryTable.clearFilters}
          />

          <DashboardInventoryTable
              rows={inventoryTable.pagination.paginatedItems}
              currentPage={inventoryTable.pagination.currentPage}
              pageSize={inventoryTable.pagination.pageSize}
              totalItems={inventoryTable.pagination.totalItems}
              totalPages={inventoryTable.pagination.totalPages}
              pageStart={inventoryTable.pagination.pageStart}
              pageEnd={inventoryTable.pagination.pageEnd}
              onPageChange={inventoryTable.pagination.setCurrentPage}
              onPageSizeChange={inventoryTable.pagination.setPageSize}
              onItemClick={(row) =>
                navigate(getItemDetailsRoute(row.categoryKey, row.itemId, 'dashboard'))
              }
              onItemPrefetch={(row) => {
                void prefetchInventoryItem(
                  queryClient,
                  categoryConfig[row.categoryKey].table,
                  row.itemId,
                )
              }}
          />
        </div>
      </DashboardTableSection>
    </section>
  )
}
