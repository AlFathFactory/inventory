import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { TablePagination } from '../components/TablePagination'
import {
  categoryConfig,
  type CategoryDefinition,
  type CategoryKey,
} from '../config/categoryConfig'
import { usePagination } from '../hooks/usePagination'
import {
  getCategoryRows,
  getCategoryRowsByDateRange,
  type InventoryRow,
} from '../services/inventoryService'
import {
  getStockStatus,
  getStockStatusClass,
  getStockStatusLabel,
} from '../utils/statusUtils'

type DateFilterMode = 'single' | 'range'

function isCategoryKey(value: string): value is CategoryKey {
  return value in categoryConfig
}

function getDisplayValue(value: InventoryRow[string]) {
  if (Array.isArray(value)) {
    return value.join(', ')
  }

  if (value === null || value === undefined || value === '') {
    return '—'
  }

  return String(value)
}

function formatDateLabel(value: string) {
  if (!value) {
    return ''
  }

  const [year, month, day] = value.split('-')

  if (!year || !month || !day) {
    return value
  }

  return `${day}/${month}/${year}`
}

export function CategoryPage() {
  const { categoryKey } = useParams()
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('single')
  const [singleDate, setSingleDate] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const category: CategoryDefinition | null =
    categoryKey && isCategoryKey(categoryKey)
      ? (categoryConfig[categoryKey] as CategoryDefinition)
      : null

  const deferredSearchTerm = useDeferredValue(searchTerm)
  const activeFromDate = dateFilterMode === 'single' ? singleDate : fromDate
  const activeToDate = dateFilterMode === 'single' ? singleDate : toDate
  const hasDateFilter = Boolean(
    category?.dateField &&
      activeFromDate.trim() &&
      activeToDate.trim(),
  )
  const dateFilterSummary =
    dateFilterMode === 'single'
      ? singleDate
        ? `تاريخ محدد: ${formatDateLabel(singleDate)}`
        : 'اختر يومًا واحدًا للبحث السريع'
      : fromDate && toDate
        ? `الفترة: ${formatDateLabel(fromDate)} - ${formatDateLabel(toDate)}`
        : 'اختر تاريخ البداية والنهاية'

  useEffect(() => {
    if (!category) {
      setRows([])
      setError(null)
      setIsLoading(false)
      return
    }

    const activeCategory = category
    let isCancelled = false

    async function loadRows() {
      setIsLoading(true)
      setError(null)

      const result = hasDateFilter
        ? await getCategoryRowsByDateRange(
            activeCategory.table,
            activeCategory.dateField,
            activeFromDate,
            activeToDate,
          )
        : await getCategoryRows(activeCategory.table)

      if (isCancelled) {
        return
      }

      if (result.error) {
        setRows([])
        setError(result.error)
      } else {
        setRows(result.data ?? [])
      }

      setIsLoading(false)
    }

    void loadRows()

    return () => {
      isCancelled = true
    }
  }, [activeFromDate, activeToDate, category, hasDateFilter])

  const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase()
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (!normalizedSearchTerm || !category) {
          return true
        }

        return category.searchableFields.some((field) => {
          const fieldValue = row[field]
          const displayValue = Array.isArray(fieldValue)
            ? fieldValue.join(' ')
            : String(fieldValue ?? '')

          return displayValue.toLowerCase().includes(normalizedSearchTerm)
        })
      }),
    [category, normalizedSearchTerm, rows],
  )
  const pagination = usePagination(filteredRows, { initialPageSize: 10 })

  const columnEntries = category ? Object.entries(category.columns) : []
  const hasStockStatus =
    Boolean(category?.stockField) && Boolean(category?.minQuantityField)

  if (!category) {
    return (
      <section>
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-8 shadow-[var(--app-shadow)]">
          <h1 className="text-2xl font-semibold text-slate-900">تصنيف غير موجود</h1>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <div
        className={[
          'grid gap-4 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4',
          category.dateField ? 'md:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]' : 'md:grid-cols-1',
        ].join(' ')}
      >
        <label className="space-y-2">
          <span className="block text-sm font-medium text-slate-700">بحث</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="ابحث داخل الجدول"
            className="w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
          />
        </label>

        {category.dateField ? (
          <div className="rounded-[24px] border border-[var(--app-border)] bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-right">
                <span className="block text-sm font-medium text-slate-700">
                  فلتر التاريخ
                </span>
                <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                  {dateFilterSummary}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSingleDate('')
                  setFromDate('')
                  setToDate('')
                }}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--app-border)] px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                مسح
              </button>
            </div>

            <div className="mt-3 inline-flex rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setDateFilterMode('single')
                  setFromDate('')
                  setToDate('')
                }}
                className={[
                  'rounded-[14px] px-4 py-2 text-sm font-medium transition',
                  dateFilterMode === 'single'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900',
                ].join(' ')}
              >
                يوم واحد
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFilterMode('range')
                  setSingleDate('')
                }}
                className={[
                  'rounded-[14px] px-4 py-2 text-sm font-medium transition',
                  dateFilterMode === 'range'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900',
                ].join(' ')}
              >
                فترة
              </button>
            </div>

            {dateFilterMode === 'single' ? (
              <label className="mt-3 block space-y-2">
                <span className="block text-xs font-medium text-slate-500">
                  اختر التاريخ
                </span>
                <input
                  type="date"
                  value={singleDate}
                  onChange={(event) => setSingleDate(event.target.value)}
                  className="w-full rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                />
              </label>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="block text-xs font-medium text-slate-500">
                    من تاريخ
                  </span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    className="w-full rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  />
                </label>

                <label className="space-y-2">
                  <span className="block text-xs font-medium text-slate-500">
                    إلى تاريخ
                  </span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    className="w-full rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  />
                </label>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-10 text-center text-sm text-slate-500 shadow-[var(--app-shadow)]">
          جاري تحميل البيانات...
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-600">
          حدث خطأ أثناء تحميل البيانات: {error}
        </div>
      ) : null}

      {!isLoading && !error && filteredRows.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-10 text-center text-sm text-slate-500 shadow-[var(--app-shadow)]">
          لا توجد بيانات لعرضها
        </div>
      ) : null}

      {!isLoading && !error && filteredRows.length > 0 ? (
        <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-right">
              <thead className="bg-[var(--app-panel-soft)]">
                <tr>
                  {hasStockStatus ? (
                    <th className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-700">
                      الحالة
                    </th>
                  ) : null}
                  {columnEntries.map(([field, label]) => (
                    <th
                      key={field}
                      className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-700"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagination.paginatedItems.map((row, index) => {
                  const stockStatus =
                    hasStockStatus && category.stockField && category.minQuantityField
                      ? getStockStatus(
                          row,
                          category.stockField,
                          category.minQuantityField,
                        )
                      : null

                  return (
                    <tr
                      key={`${category.table}-${pagination.pageStart + index}`}
                      className="hover:bg-slate-50"
                    >
                      {hasStockStatus ? (
                        <td className="px-4 py-3 align-top text-sm">
                          {stockStatus ? (
                            <span
                              className={[
                                'inline-flex rounded-full px-3 py-1 text-xs font-medium',
                                getStockStatusClass(stockStatus),
                              ].join(' ')}
                            >
                              {getStockStatusLabel(stockStatus)}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                              غير محدد
                            </span>
                          )}
                        </td>
                      ) : null}
                      {columnEntries.map(([field]) => (
                        <td
                          key={field}
                          className="whitespace-nowrap px-4 py-3 text-sm text-slate-600"
                        >
                          {getDisplayValue(row[field])}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={pagination.currentPage}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
            pageStart={pagination.pageStart}
            pageEnd={pagination.pageEnd}
            onPageChange={pagination.setCurrentPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </div>
      ) : null}
    </section>
  )
}
