import { categoryConfig } from '../../config/categoryConfig'
import type { DashboardInventoryRow } from '../dashboard/types'
import {
  getMatrixCellTotal,
  type MatrixOperationType,
} from './operationsMatrix'

type OperationsMatrixTableProps = {
  rows: DashboardInventoryRow[]
  dates: string[]
  movementTotals: ReadonlyMap<string, number>
  isLoading: boolean
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

const weekdayFormatter = new Intl.DateTimeFormat('ar-EG', {
  weekday: 'short',
})

function formatQuantity(value: number | null) {
  return value === null ? '—' : numberFormatter.format(value)
}

function getDateParts(dateValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return {
    day: String(day).padStart(2, '0'),
    weekday: weekdayFormatter.format(date),
  }
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

export function OperationsMatrixTable({
  rows,
  dates,
  movementTotals,
  isLoading,
  onItemClick,
  onItemPrefetch,
  onOperation,
}: OperationsMatrixTableProps) {
  if (!isLoading && rows.length === 0) {
    return (
      <div className="px-6 py-14 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-500">∅</div>
        <h3 className="mt-4 font-bold text-slate-800">لا توجد أصناف مطابقة</h3>
        <p className="mt-1 text-sm text-slate-500">غيّر البحث أو نوع المخزن لعرض أصناف أخرى.</p>
      </div>
    )
  }

  return (
    <div className="relative max-h-[64vh] overflow-auto">
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
        style={{ minWidth: `${390 + dates.length * 164}px` }}
      >
        <thead className="sticky top-0 z-30">
          <tr>
            <th
              rowSpan={2}
              className="sticky right-0 z-40 w-[270px] border-b border-l border-slate-300 bg-slate-900 px-4 py-3 text-right font-bold text-white"
            >
              الصنف
            </th>
            <th
              rowSpan={2}
              className="sticky right-[270px] z-40 w-[120px] border-b border-l border-slate-300 bg-slate-900 px-3 py-3 text-center font-bold text-white"
            >
              الرصيد
            </th>
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
          {rows.map((row, index) => {
            const tableName = categoryConfig[row.categoryKey].table
            return (
              <tr key={row.id} className="group">
                <td className="sticky right-0 z-20 w-[270px] border-b border-l border-slate-200 bg-white p-1.5 text-right group-hover:bg-slate-50">
                  <button
                    type="button"
                    onClick={() => onItemClick(row)}
                    onMouseEnter={() => onItemPrefetch(row)}
                    onFocus={() => onItemPrefetch(row)}
                    aria-label={`فتح تفاصيل ${row.itemName}`}
                    className="flex w-full min-w-0 items-start gap-3 rounded-xl px-2.5 py-1.5 text-right transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <span className="mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 px-1 text-[11px] font-bold text-slate-500">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate font-bold text-slate-900 underline-offset-4 hover:text-blue-700 hover:underline">{row.itemName}</strong>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {row.categoryLabel}{row.projectName ? ` · ${row.projectName}` : ''}
                      </span>
                    </span>
                    <span className="mt-1 text-blue-500" aria-hidden="true">←</span>
                  </button>
                </td>
                <td className="sticky right-[270px] z-20 w-[120px] border-b border-l border-slate-200 bg-emerald-50 px-3 text-center font-bold text-emerald-900 group-hover:bg-emerald-100">
                  {formatQuantity(row.stockBalance)}
                </td>
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
        </tbody>
      </table>
    </div>
  )
}
