import { Link } from 'react-router-dom'
import { DashboardStatCard } from '../features/dashboard/components/DashboardStatCard'
import { DashboardTableSection } from '../features/dashboard/components/DashboardTableSection'
import { InventoryAlertsTable } from '../features/dashboard/components/InventoryAlertsTable'
import { RecentOperationsTable } from '../features/dashboard/components/RecentOperationsTable'
import { useDashboardData } from '../features/dashboard/hooks/useDashboardData'

export function DashboardPage() {
  const { data, isLoading, error } = useDashboardData()

  return (
    <section className="space-y-8">
      <div className="rounded-[30px] border border-slate-200 bg-white px-7 py-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="order-2 lg:order-1 lg:w-[280px]">
            <label className="block">
              <span className="sr-only">بحث سريع</span>
              <input
                type="search"
                placeholder="بحث سريع..."
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-300"
              />
            </label>
          </div>

          <div className="order-1 text-right lg:order-2">
            <h1 className="text-[2.15rem] font-bold tracking-tight text-slate-900">
              لوحة التحكم
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              نظام CRUD كامل لإدارة المخزون والمشاريع والعمليات
            </p>
          </div>
        </div>
      </div>

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

      {isLoading ? (
        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          جاري تحميل بيانات لوحة التحكم...
        </div>
      ) : null}

      <DashboardTableSection
        title="الأصناف الحرجة"
        action={
          <Link
            to="/import"
            className="inline-flex h-11 items-center rounded-2xl bg-blue-600 px-7 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            إضافة كمية
          </Link>
        }
      >
        <InventoryAlertsTable rows={data.alerts} />
      </DashboardTableSection>

      <DashboardTableSection title="آخر العمليات">
        <RecentOperationsTable rows={data.recentOperations} />
      </DashboardTableSection>
    </section>
  )
}
