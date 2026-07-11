import { Link } from 'react-router-dom'
import { DashboardInventoryFilters } from '../features/dashboard/components/DashboardInventoryFilters'
import { DashboardInventoryTable } from '../features/dashboard/components/DashboardInventoryTable'
import { DashboardStatCard } from '../features/dashboard/components/DashboardStatCard'
import { DashboardTableSection } from '../features/dashboard/components/DashboardTableSection'
import { useDashboardData } from '../features/dashboard/hooks/useDashboardData'
import { useDashboardInventoryTable } from '../features/dashboard/hooks/useDashboardInventoryTable'
import {
  getSupabaseConfigError,
  isSupabaseConfigured,
} from '../lib/supabaseClient'

export function DashboardPage() {
  const { data, isLoading, error } = useDashboardData()
  const inventoryTable = useDashboardInventoryTable(data.inventoryRows)
  const configError = !isSupabaseConfigured ? getSupabaseConfigError() : null

  return (
    <section className="space-y-8">
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

      {data.isDemo ? (
        <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          يتم عرض بيانات تجريبية لمعاينة تصميم لوحة التحكم.
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
        action={
          <Link
            to="/import"
            className="inline-flex h-[42px] items-center rounded-2xl bg-[var(--app-primary)] px-5 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            إضافة كمية
          </Link>
        }
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

          {isLoading ? (
            <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-10 text-center text-sm text-slate-500 shadow-[var(--app-shadow)]">
              جاري تحميل بيانات لوحة التحكم...
            </div>
          ) : (
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
            />
          )}
        </div>
      </DashboardTableSection>
    </section>
  )
}
