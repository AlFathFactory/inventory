import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
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

function parseDateValue(value: string) {
  if (!value) {
    return null
  }

  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day)
}

function formatMonthLabel(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(value)
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1)
}

function toDateValue(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function buildCalendarDays(month: Date) {
  const firstDay = startOfMonth(month)
  const firstWeekday = firstDay.getDay()
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(
      month.getFullYear(),
      month.getMonth(),
      index - firstWeekday + 1,
    )

    return {
      value: toDateValue(date),
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === month.getMonth(),
    }
  })
}

type CategoryDatePickerProps = {
  fromDate: string
  toDate: string
  draftStartDate: string
  isOpen: boolean
  visibleMonth: Date
  onOpenChange: (isOpen: boolean) => void
  onMonthChange: (month: Date) => void
  onDraftStartDateChange: (value: string) => void
  onDateRangeChange: (fromDate: string, toDate: string) => void
  onClear: () => void
}

function CategoryDatePicker({
  fromDate,
  toDate,
  draftStartDate,
  isOpen,
  visibleMonth,
  onOpenChange,
  onMonthChange,
  onDraftStartDateChange,
  onDateRangeChange,
  onClear,
}: CategoryDatePickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonth),
    [visibleMonth],
  )
  const displayValue =
    fromDate && toDate
      ? fromDate === toDate
        ? formatDateLabel(fromDate)
        : `${formatDateLabel(fromDate)} - ${formatDateLabel(toDate)}`
      : draftStartDate
        ? `ابدأ من ${formatDateLabel(draftStartDate)}`
        : 'اختر يومًا أو فترة'
  const helperText =
    fromDate && toDate
      ? fromDate === toDate
        ? 'نقرتان لاختيار يوم واحد'
        : 'تم تحديد فترة تاريخ'
      : draftStartDate
        ? 'اختر التاريخ الثاني لإكمال الفترة'
        : 'انقر مرة لبدء الفترة أو نقرتين لاختيار يوم واحد'

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        onOpenChange(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen, onOpenChange])

  function handleDayClick(value: string) {
    if (!draftStartDate || (fromDate && toDate)) {
      onDraftStartDateChange(value)
      onDateRangeChange('', '')
      return
    }

    if (value < draftStartDate) {
      onDateRangeChange(value, draftStartDate)
    } else if (value > draftStartDate) {
      onDateRangeChange(draftStartDate, value)
    } else {
      onDateRangeChange(value, value)
    }

    onDraftStartDateChange('')
  }

  function handleDayDoubleClick(value: string) {
    onDraftStartDateChange('')
    onDateRangeChange(value, value)
    onOpenChange(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="rounded-[24px] border border-[var(--app-border)] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-right">
            <span className="block text-sm font-medium text-slate-700">
              فلتر التاريخ
            </span>
            <p className="mt-1 text-xs text-[var(--app-text-muted)]">
              {helperText}
            </p>
          </div>

          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--app-border)] px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            مسح
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(!isOpen)}
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-right transition hover:border-slate-300"
        >
          <span className="text-sm text-slate-900">{displayValue}</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4" />
              <path d="M8 2v4" />
              <path d="M3 10h18" />
            </svg>
          </span>
        </button>
      </div>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+12px)] z-30 rounded-[28px] border border-[var(--app-border)] bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onMonthChange(addMonths(visibleMonth, -1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>

            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
              {formatMonthLabel(visibleMonth)}
            </div>

            <button
              type="button"
              onClick={() => onMonthChange(addMonths(visibleMonth, 1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-y-2 text-center text-xs font-medium text-slate-500">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <div key={day} className="py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-y-2 text-center">
            {calendarDays.map((day) => {
              const isRangeStart = Boolean(fromDate) && fromDate === day.value
              const isRangeEnd = Boolean(toDate) && toDate === day.value
              const isSingleDay = Boolean(fromDate && toDate) && fromDate === toDate
              const isDraftStart = draftStartDate === day.value
              const isInRange =
                Boolean(fromDate && toDate) &&
                fromDate <= day.value &&
                day.value <= toDate
              const showHighlight = isInRange && !isSingleDay

              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => handleDayClick(day.value)}
                  onDoubleClick={() => handleDayDoubleClick(day.value)}
                  className={[
                    'relative h-11 text-sm transition',
                    day.isCurrentMonth ? 'text-slate-800' : 'text-slate-300',
                    showHighlight ? 'bg-blue-100/90' : 'hover:bg-slate-50',
                    isRangeStart ? 'rounded-r-full' : '',
                    isRangeEnd ? 'rounded-l-full' : '',
                    isRangeStart && isRangeEnd ? 'rounded-full' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mx-auto flex h-9 w-9 items-center justify-center rounded-full',
                      isRangeStart || isRangeEnd || isDraftStart
                        ? 'bg-[var(--app-primary)] font-semibold text-white shadow-sm'
                        : '',
                    ].join(' ')}
                  >
                    {day.dayNumber}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function CategoryPage() {
  const { categoryKey } = useParams()
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [draftStartDate, setDraftStartDate] = useState('')
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()))

  const category: CategoryDefinition | null =
    categoryKey && isCategoryKey(categoryKey)
      ? (categoryConfig[categoryKey] as CategoryDefinition)
      : null

  const deferredSearchTerm = useDeferredValue(searchTerm)
  const hasDateFilter = Boolean(
    category?.dateField &&
      fromDate.trim() &&
      toDate.trim(),
  )

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
            fromDate,
            toDate,
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
  }, [category, fromDate, toDate, hasDateFilter])

  useEffect(() => {
    const activeDate = fromDate || draftStartDate
    const parsedDate = parseDateValue(activeDate)

    if (parsedDate) {
      setVisibleMonth(startOfMonth(parsedDate))
    }
  }, [draftStartDate, fromDate])

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
          <CategoryDatePicker
            fromDate={fromDate}
            toDate={toDate}
            draftStartDate={draftStartDate}
            isOpen={isDatePickerOpen}
            visibleMonth={visibleMonth}
            onOpenChange={setIsDatePickerOpen}
            onMonthChange={setVisibleMonth}
            onDraftStartDateChange={setDraftStartDate}
            onDateRangeChange={(nextFromDate, nextToDate) => {
              setFromDate(nextFromDate)
              setToDate(nextToDate)
            }}
            onClear={() => {
              setFromDate('')
              setToDate('')
              setDraftStartDate('')
            }}
          />
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
