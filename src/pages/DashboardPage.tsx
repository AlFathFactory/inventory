import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  categoryConfig,
  categoryOptions,
  type CategoryKey,
} from '../config/categoryConfig'
import {
  getCategoryRows,
  getLowStockRows,
  getOutOfStockRows,
  type InventoryRow,
} from '../services/inventoryService'
import {
  getStockStatusClass,
  getStockStatusLabel,
} from '../utils/statusUtils'

type DashboardStats = {
  totalCategories: number
  totalImportedFiles: number
  totalMainRows: number
  lowStockItemsCount: number
  outOfStockItemsCount: number
  lastImportedFile: string | null
}

type CategoryCard = {
  key: CategoryKey
  label: string
  route: string
  table: string
  rowCount: number
}

type ImportLogRow = InventoryRow & {
  file_name?: string
  imported_at?: string
}

const mainInventoryTables = new Set([
  'consumables',
  'paints',
  'cones4_materials',
  'screws',
  'stock_screws',
  'raw_materials',
  'cylinders',
])

function extractStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalCategories: categoryOptions.length,
    totalImportedFiles: 0,
    totalMainRows: 0,
    lowStockItemsCount: 0,
    outOfStockItemsCount: 0,
    lastImportedFile: null,
  })
  const [categoryCards, setCategoryCards] = useState<CategoryCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    async function loadDashboard() {
      setIsLoading(true)
      setError(null)

      const categoryEntries = Object.entries(categoryConfig) as Array<
        [CategoryKey, (typeof categoryConfig)[CategoryKey]]
      >

      const importsPromise = getCategoryRows<ImportLogRow>('imports')
      const rowCountPromises = categoryEntries.map(async ([key, category]) => {
        const result = await getCategoryRows(category.table)

        return {
          key,
          label: category.label,
          route: category.route,
          table: category.table,
          result,
        }
      })

      const lowStockPromises = categoryEntries
        .filter(([, category]) => category.stockField && category.minQuantityField)
        .map(([, category]) =>
          getLowStockRows(
            category.table,
            category.stockField as string,
            category.minQuantityField as string,
          ),
        )

      const outOfStockPromises = categoryEntries
        .filter(([, category]) => category.stockField)
        .map(([, category]) =>
          getOutOfStockRows(category.table, category.stockField as string),
        )

      const [importsResult, categoryRowResults, lowStockResults, outOfStockResults] =
        await Promise.all([
          importsPromise,
          Promise.all(rowCountPromises),
          Promise.all(lowStockPromises),
          Promise.all(outOfStockPromises),
        ])

      if (isCancelled) {
        return
      }

      const errorMessages: string[] = []

      if (importsResult.error) {
        errorMessages.push(`فشل تحميل سجل الاستيراد: ${importsResult.error}`)
      }

      categoryRowResults.forEach(({ table, result }) => {
        if (result.error) {
          errorMessages.push(`فشل تحميل جدول ${table}: ${result.error}`)
        }
      })

      lowStockResults.forEach((result) => {
        if (result.error) {
          errorMessages.push(`فشل تحميل عناصر المخزون المنخفض: ${result.error}`)
        }
      })

      outOfStockResults.forEach((result) => {
        if (result.error) {
          errorMessages.push(`فشل تحميل عناصر النفاد: ${result.error}`)
        }
      })

      const cards = categoryRowResults.map(
        ({ key, label, route, table, result }): CategoryCard => ({
          key,
          label,
          route,
          table,
          rowCount: result.data?.length ?? 0,
        }),
      )

      const totalMainRows = cards.reduce((total, card) => {
        return mainInventoryTables.has(card.table) ? total + card.rowCount : total
      }, 0)

      const totalImportedFiles = importsResult.data?.length ?? 0
      const latestImport = [...(importsResult.data ?? [])]
        .sort((firstRow, secondRow) => {
          const firstDate = extractStringValue(firstRow.imported_at)
          const secondDate = extractStringValue(secondRow.imported_at)

          return new Date(secondDate ?? 0).getTime() - new Date(firstDate ?? 0).getTime()
        })
        .at(0)

      const lowStockItemsCount = lowStockResults.reduce((total, result) => {
        return total + (result.data?.length ?? 0)
      }, 0)

      const outOfStockItemsCount = outOfStockResults.reduce((total, result) => {
        return total + (result.data?.length ?? 0)
      }, 0)

      setCategoryCards(cards)
      setStats({
        totalCategories: categoryOptions.length,
        totalImportedFiles,
        totalMainRows,
        lowStockItemsCount,
        outOfStockItemsCount,
        lastImportedFile: latestImport
          ? extractStringValue(latestImport.file_name)
          : null,
      })
      setError(errorMessages.length > 0 ? errorMessages.join(' | ') : null)
      setIsLoading(false)
    }

    void loadDashboard()

    return () => {
      isCancelled = true
    }
  }, [])

  return (
    <section className="space-y-6 p-6 sm:p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">لوحة التحكم</h1>
        <p className="text-sm text-slate-500">
          نظرة سريعة على المخزون والاستيراد داخل النظام.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          جاري تحميل بيانات لوحة التحكم...
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">إجمالي الفئات</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {stats.totalCategories}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">إجمالي الملفات المستوردة</p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {stats.totalImportedFiles}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">
                إجمالي الصفوف في الجداول الرئيسية
              </p>
              <p className="mt-3 text-3xl font-semibold text-slate-900">
                {stats.totalMainRows}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">عناصر المخزون المنخفض</p>
              <div className="mt-3 flex items-center gap-3">
                <p className="text-3xl font-semibold text-slate-900">
                  {stats.lowStockItemsCount}
                </p>
                <span
                  className={[
                    'inline-flex rounded-full px-3 py-1 text-xs font-medium',
                    getStockStatusClass('low'),
                  ].join(' ')}
                >
                  {getStockStatusLabel('low')}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">عناصر نفاد المخزون</p>
              <div className="mt-3 flex items-center gap-3">
                <p className="text-3xl font-semibold text-slate-900">
                  {stats.outOfStockItemsCount}
                </p>
                <span
                  className={[
                    'inline-flex rounded-full px-3 py-1 text-xs font-medium',
                    getStockStatusClass('out'),
                  ].join(' ')}
                >
                  {getStockStatusLabel('out')}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">آخر ملف تم استيراده</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                {stats.lastImportedFile ?? 'لا يوجد استيراد بعد'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                الفئات وعدد الصفوف
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {categoryCards.map((card) => (
                <Link
                  key={card.key}
                  to={card.route}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  <p className="text-sm text-slate-500">{card.table}</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">
                    {card.label}
                  </h3>
                  <p className="mt-4 text-2xl font-semibold text-slate-900">
                    {card.rowCount}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">عدد الصفوف</p>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
