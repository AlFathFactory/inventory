import { useEffect, useMemo, useRef, useState } from 'react'
import { categoryConfig } from '../../config/categoryConfig'
import type { DashboardInventoryRow } from '../dashboard/types'
import {
  getMatrixCellTotal,
  getOperationsMatrixFrozenColumns,
  type MatrixFrozenColumn,
  type MatrixOperationType,
  type MatrixScrewFilters,
} from './operationsMatrix'
import { createDelayedAction } from '../../utils/delayedAction'

type OperationsMatrixTableProps = {
  rows: DashboardInventoryRow[]
  dates: string[]
  movementTotals: ReadonlyMap<string, number>
  isLoading: boolean
  showScrewDetails?: boolean
  showRawMaterialDetails?: boolean
  screwFilters?: MatrixScrewFilters
  onScrewFilterChange?: (
    filter: keyof MatrixScrewFilters,
    value: string,
  ) => void
  virtualizeRows?: boolean
  virtualizationResetKey?: string
  onItemClick: (row: DashboardInventoryRow) => void
  onItemPrefetch: (row: DashboardInventoryRow) => void
  onOperation: (
    row: DashboardInventoryRow,
    operationType: MatrixOperationType,
    operationDate: string,
  ) => void
}

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const matrixRowHeight = 62
const virtualRowOverscan = 6
const emptyScrewFilters: MatrixScrewFilters = { din: '', codeNumber: '' }

const weekdayFormatter = new Intl.DateTimeFormat('ar-EG', {
  weekday: 'short',
})

function formatQuantity(value: number | null) {
  return value === null ? '—' : numberFormatter.format(value)
}

function formatText(value: string | number | null) {
  return value === null || value === '' ? '—' : String(value)
}

function getDateParts(dateValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return {
    day: String(day).padStart(2, '0'),
    weekday: weekdayFormatter.format(date),
  }
}

function FilterIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M3 4h14l-5.5 6.1v4.4l-3 1.5v-5.9L3 4Z" strokeLinejoin="round" />
    </svg>
  )
}

function FrozenColumnHeader({
  column,
  filterValue,
  isFilterOpen,
  onFilterToggle,
  onFilterChange,
}: {
  column: MatrixFrozenColumn
  filterValue: string
  isFilterOpen: boolean
  onFilterToggle: () => void
  onFilterChange?: (value: string) => void
}) {
  const isFilterable = column.key === 'din' || column.key === 'codeNumber'

  return (
    <div className={[
      'relative flex items-center gap-1.5',
      column.key === 'project' || column.key === 'item'
        ? 'justify-start'
        : 'justify-center',
    ].join(' ')}>
      <span>{column.label}</span>
      {isFilterable && onFilterChange ? (
        <button
          type="button"
          onClick={onFilterToggle}
          aria-label={`تصفية حسب ${column.label}`}
          aria-expanded={isFilterOpen}
          className={[
            'flex h-7 w-7 items-center justify-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-blue-300',
            filterValue
              ? 'border-blue-300 bg-blue-100 text-blue-700'
              : 'border-white/25 bg-white/10 text-white hover:bg-white/20',
          ].join(' ')}
        >
          <FilterIcon />
        </button>
      ) : null}

      {isFilterable && isFilterOpen && onFilterChange ? (
        <div
          className="absolute right-1/2 top-full z-[60] mt-3 w-52 translate-x-1/2 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-800 shadow-xl"
          onKeyDown={(event) => {
            if (event.key === 'Escape') onFilterToggle()
          }}
        >
          <label className="block text-right text-[11px] font-bold text-slate-600">
            بحث في {column.label}
          </label>
          <div className="mt-1.5 flex items-center gap-1.5" dir="ltr">
            <input
              type="search"
              value={filterValue}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder={column.label}
              autoFocus
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-blue-500"
            />
            {filterValue ? (
              <button
                type="button"
                onClick={() => onFilterChange('')}
                aria-label={`مسح تصفية ${column.label}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-600 hover:bg-slate-200"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function OperationCell({
  row,
  date,
  type,
  total,
  onOperation,
}: {
  row: DashboardInventoryRow
  date: string
  type: MatrixOperationType
  total: number
  onOperation: OperationsMatrixTableProps['onOperation']
}) {
  const isAddition = type === 'add'
  const label = isAddition ? 'إضافة' : 'صرف'

  return (
    <td className={[
      'h-[62px] min-w-[82px] border-b border-l border-slate-200 p-1.5 text-center',
      isAddition ? 'bg-blue-50/45' : 'bg-white',
    ].join(' ')}>
      <button
        type="button"
        onClick={() => onOperation(row, type, date)}
        aria-label={`${label} ${row.itemName} بتاريخ ${date}`}
        title={total > 0 ? `تسجيل حركة ${label} إضافية` : `تسجيل ${label}`}
        className={[
          'group flex h-[48px] w-full items-center justify-center rounded-xl text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
          total > 0
            ? isAddition
              ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
              : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            : isAddition
              ? 'text-blue-300 hover:bg-blue-100 hover:text-blue-700'
              : 'text-slate-300 hover:bg-slate-100 hover:text-slate-700',
        ].join(' ')}
      >
        {total > 0 ? numberFormatter.format(total) : (
          <span className="text-lg font-normal transition-transform group-hover:scale-110" aria-hidden="true">+</span>
        )}
      </button>
    </td>
  )
}

function FrozenCell({
  column,
  right,
  row,
  rowNumber,
  showScrewDetails,
  showRawMaterialDetails,
  onItemClick,
  delayedItemPrefetch,
}: {
  column: MatrixFrozenColumn
  right: number
  row: DashboardInventoryRow
  rowNumber: number
  showScrewDetails: boolean
  showRawMaterialDetails: boolean
  onItemClick: OperationsMatrixTableProps['onItemClick']
  delayedItemPrefetch: ReturnType<typeof createDelayedAction<DashboardInventoryRow>>
}) {
  const sizeStyle = {
    right,
    width: column.width,
    minWidth: column.width,
    maxWidth: column.width,
  }

  if (column.key === 'item') {
    return (
      <td
        className="sticky z-20 border-b border-l border-slate-200 bg-white p-1.5 text-right group-hover:bg-slate-50"
        style={sizeStyle}
      >
        <button
          type="button"
          onClick={() => onItemClick(row)}
          onMouseEnter={() => delayedItemPrefetch.schedule(row)}
          onMouseLeave={delayedItemPrefetch.cancel}
          onFocus={() => delayedItemPrefetch.runNow(row)}
          aria-label={`فتح تفاصيل ${row.itemName}`}
          className="flex w-full min-w-0 items-start gap-3 rounded-xl px-2.5 py-1.5 text-right transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <span className="mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 px-1 text-[11px] font-bold text-slate-500">
            {rowNumber}
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate font-bold text-slate-900 underline-offset-4 hover:text-blue-700 hover:underline">
              {row.itemName}
            </strong>
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {row.categoryLabel}
              {!showScrewDetails && !showRawMaterialDetails && row.projectName
                ? ` · ${row.projectName}`
                : ''}
            </span>
          </span>
          <span className="mt-1 text-blue-500" aria-hidden="true">←</span>
        </button>
      </td>
    )
  }

  if (column.key === 'balance') {
    return (
      <td
        className="sticky z-20 border-b border-l border-slate-200 bg-emerald-50 px-3 text-center font-bold text-emerald-900 group-hover:bg-emerald-100"
        style={sizeStyle}
      >
        {formatQuantity(row.stockBalance)}
      </td>
    )
  }

  const value = column.key === 'project'
    ? row.projectName
    : column.key === 'din'
      ? row.din
      : column.key === 'codeNumber'
        ? row.codeNumber
        : column.key === 'length'
          ? row.length
          : column.key === 'width'
            ? row.width
            : column.key === 'dimension'
              ? row.thickness ?? row.dimensionText
              : row.weight

  return (
    <td
      className={[
        'sticky z-20 border-b border-l border-slate-200 bg-white px-3 font-semibold text-slate-700 group-hover:bg-slate-50',
        column.key === 'project' ? 'text-right' : 'text-center',
      ].join(' ')}
      style={sizeStyle}
      dir={column.key === 'project' ? 'rtl' : 'ltr'}
      title={formatText(value)}
    >
      <span className="block truncate">{formatText(value)}</span>
    </td>
  )
}

export function OperationsMatrixTable({
  rows,
  dates,
  movementTotals,
  isLoading,
  showScrewDetails = false,
  showRawMaterialDetails = false,
  screwFilters = emptyScrewFilters,
  onScrewFilterChange,
  virtualizeRows = false,
  virtualizationResetKey = '',
  onItemClick,
  onItemPrefetch,
  onOperation,
}: OperationsMatrixTableProps) {
  const scrollContainer = useRef<HTMLDivElement>(null)
  const scrollFrame = useRef<number | null>(null)
  const pendingScrollPosition = useRef({ scrollTop: 0, viewportHeight: 640 })
  const [scrollPosition, setScrollPosition] = useState(
    pendingScrollPosition.current,
  )
  const [openScrewFilter, setOpenScrewFilter] = useState<
    keyof MatrixScrewFilters | null
  >(null)
  const delayedItemPrefetch = useMemo(
    () => createDelayedAction(onItemPrefetch, 250),
    [onItemPrefetch],
  )
  const frozenColumns = getOperationsMatrixFrozenColumns(
    showScrewDetails,
    showRawMaterialDetails,
  )
  const frozenColumnOffsets = frozenColumns.map((_, columnIndex) =>
    frozenColumns
      .slice(0, columnIndex)
      .reduce((total, column) => total + column.width, 0),
  )
  const frozenColumnsWidth = frozenColumns.reduce(
    (total, column) => total + column.width,
    0,
  )
  const matrixColumnCount = frozenColumns.length + dates.length * 2
  const hasActiveScrewFilters = showScrewDetails && Boolean(
    screwFilters.din.trim() || screwFilters.codeNumber.trim(),
  )

  useEffect(() => () => {
    if (scrollFrame.current !== null) {
      cancelAnimationFrame(scrollFrame.current)
    }
  }, [])

  useEffect(() => () => delayedItemPrefetch.dispose(), [delayedItemPrefetch])

  useEffect(() => {
    if (!showScrewDetails) setOpenScrewFilter(null)
  }, [showScrewDetails])

  useEffect(() => {
    if (!virtualizeRows) return
    const container = scrollContainer.current
    if (scrollFrame.current !== null) {
      cancelAnimationFrame(scrollFrame.current)
      scrollFrame.current = null
    }
    if (container) container.scrollTop = 0
    const initialPosition = {
      scrollTop: 0,
      viewportHeight: container?.clientHeight || 640,
    }
    pendingScrollPosition.current = initialPosition
    setScrollPosition(initialPosition)
  }, [virtualizationResetKey, virtualizeRows])

  const virtualRange = useMemo(() => {
    if (!virtualizeRows) {
      return { start: 0, end: rows.length }
    }

    const visibleStart = Math.floor(scrollPosition.scrollTop / matrixRowHeight)
    const visibleRowCount = Math.ceil(
      scrollPosition.viewportHeight / matrixRowHeight,
    )
    const start = Math.min(
      Math.max(0, visibleStart - virtualRowOverscan),
      Math.max(0, rows.length - visibleRowCount),
    )
    const end = Math.min(
      rows.length,
      visibleStart + visibleRowCount + virtualRowOverscan,
    )
    return { start, end }
  }, [rows.length, scrollPosition, virtualizeRows])

  const renderedRows = virtualizeRows
    ? rows.slice(virtualRange.start, virtualRange.end)
    : rows
  const topSpacerHeight = virtualizeRows
    ? virtualRange.start * matrixRowHeight
    : 0
  const bottomSpacerHeight = virtualizeRows
    ? (rows.length - virtualRange.end) * matrixRowHeight
    : 0

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    if (!virtualizeRows) return
    const nextPosition = {
      scrollTop:
        Math.floor(event.currentTarget.scrollTop / matrixRowHeight) *
        matrixRowHeight,
      viewportHeight: event.currentTarget.clientHeight,
    }
    if (
      pendingScrollPosition.current.scrollTop === nextPosition.scrollTop &&
      pendingScrollPosition.current.viewportHeight === nextPosition.viewportHeight
    ) return

    pendingScrollPosition.current = nextPosition
    if (scrollFrame.current !== null) return

    scrollFrame.current = requestAnimationFrame(() => {
      setScrollPosition(pendingScrollPosition.current)
      scrollFrame.current = null
    })
  }

  if (!isLoading && rows.length === 0 && !hasActiveScrewFilters) {
    return (
      <div className="px-6 py-14 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-500">∅</div>
        <h3 className="mt-4 font-bold text-slate-800">لا توجد أصناف مطابقة</h3>
        <p className="mt-1 text-sm text-slate-500">غيّر البحث أو نوع المخزن لعرض أصناف أخرى.</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollContainer}
      className="relative max-h-[78vh] overflow-auto"
      onScroll={handleScroll}
    >
      {isLoading ? (
        <div className="absolute inset-0 z-40 flex min-h-80 items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-lg">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            جارٍ تحميل الحركات...
          </div>
        </div>
      ) : null}

      <table
        className="w-full table-fixed border-separate border-spacing-0 text-sm"
        style={{ minWidth: `${frozenColumnsWidth + dates.length * 164}px` }}
      >
        <thead className="sticky top-0 z-30">
          <tr>
            {frozenColumns.map((column, columnIndex) => {
              const filterKey = column.key === 'din' || column.key === 'codeNumber'
                ? column.key
                : null

              return (
                <th
                  key={column.key}
                  rowSpan={2}
                  className={[
                    'sticky z-40 border-b border-l border-slate-300 bg-slate-900 px-3 py-3 font-bold text-white',
                    column.key === 'project' || column.key === 'item'
                      ? 'text-right'
                      : 'text-center',
                  ].join(' ')}
                  style={{
                    right: frozenColumnOffsets[columnIndex],
                    width: column.width,
                    minWidth: column.width,
                    maxWidth: column.width,
                  }}
                >
                  <FrozenColumnHeader
                    column={column}
                    filterValue={filterKey ? screwFilters[filterKey] : ''}
                    isFilterOpen={filterKey !== null && openScrewFilter === filterKey}
                    onFilterToggle={() => {
                      if (!filterKey) return
                      setOpenScrewFilter((currentFilter) =>
                        currentFilter === filterKey ? null : filterKey,
                      )
                    }}
                    onFilterChange={filterKey && onScrewFilterChange
                      ? (value) => onScrewFilterChange(filterKey, value)
                      : undefined}
                  />
                </th>
              )
            })}
            {dates.map((date) => {
              const parts = getDateParts(date)
              return (
                <th
                  key={date}
                  colSpan={2}
                  className="border-b border-l border-slate-300 bg-slate-800 px-2 py-2 text-center text-white"
                >
                  <span dir="ltr" className="block text-base font-bold">{parts.day}</span>
                  <span className="block text-[11px] font-medium text-slate-300">{parts.weekday}</span>
                </th>
              )
            })}
          </tr>
          <tr>
            {dates.flatMap((date) => [
              <th
                key={`${date}-issue`}
                className="w-[82px] border-b border-l border-slate-300 bg-slate-100 px-2 py-2 text-center text-xs font-bold text-slate-700"
              >
                صرف
              </th>,
              <th
                key={`${date}-add`}
                className="w-[82px] border-b border-l border-blue-200 bg-blue-100 px-2 py-2 text-center text-xs font-bold text-blue-800"
              >
                إضافة
              </th>,
            ])}
          </tr>
        </thead>

        <tbody>
          {topSpacerHeight > 0 ? (
            <tr aria-hidden="true">
              <td
                colSpan={matrixColumnCount}
                className="border-0 p-0"
                style={{ height: `${topSpacerHeight}px` }}
              />
            </tr>
          ) : null}
          {!isLoading && rows.length === 0 && hasActiveScrewFilters ? (
            <tr>
              <td
                colSpan={frozenColumns.length}
                className="h-32 border-b border-l border-slate-200 bg-white px-6 text-center"
              >
                <div className="mx-auto max-w-sm">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg text-slate-500">∅</div>
                  <p className="mt-2 text-sm font-bold text-slate-800">لا توجد مسامير مطابقة للتصفية</p>
                  <p className="mt-1 text-xs text-slate-500">عدّل أو امسح تصفية DIN أو رقم الكود من الأيقونات أعلاه.</p>
                </div>
              </td>
              {dates.length > 0 ? (
                <td
                  colSpan={dates.length * 2}
                  className="border-b border-slate-200 bg-slate-50/40"
                />
              ) : null}
            </tr>
          ) : null}
          {renderedRows.map((row, index) => {
            if (row.categoryKey === 'dynamic') {
              return null
            }
            const tableName = categoryConfig[row.categoryKey].table
            const rowNumber = virtualRange.start + index + 1
            return (
              <tr key={row.id} className="group">
                {frozenColumns.map((column, columnIndex) => (
                  <FrozenCell
                    key={column.key}
                    column={column}
                    right={frozenColumnOffsets[columnIndex]}
                    row={row}
                    rowNumber={rowNumber}
                    showScrewDetails={showScrewDetails}
                    showRawMaterialDetails={showRawMaterialDetails}
                    onItemClick={onItemClick}
                    delayedItemPrefetch={delayedItemPrefetch}
                  />
                ))}
                {dates.flatMap((date) => [
                  <OperationCell
                    key={`${row.id}-${date}-issue`}
                    row={row}
                    date={date}
                    type="issue"
                    total={getMatrixCellTotal(
                      movementTotals,
                      tableName,
                      row.itemId,
                      date,
                      'issue',
                    )}
                    onOperation={onOperation}
                  />,
                  <OperationCell
                    key={`${row.id}-${date}-add`}
                    row={row}
                    date={date}
                    type="add"
                    total={getMatrixCellTotal(
                      movementTotals,
                      tableName,
                      row.itemId,
                      date,
                      'add',
                    )}
                    onOperation={onOperation}
                  />,
                ])}
              </tr>
            )
          })}
          {bottomSpacerHeight > 0 ? (
            <tr aria-hidden="true">
              <td
                colSpan={matrixColumnCount}
                className="border-0 p-0"
                style={{ height: `${bottomSpacerHeight}px` }}
              />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
