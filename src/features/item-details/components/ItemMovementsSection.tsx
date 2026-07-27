import { useEffect, useMemo } from 'react'
import { DataTable, type DataTableColumn } from '../../../components/DataTable'
import { TablePagination } from '../../../components/TablePagination'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import { usePagination } from '../../../hooks/usePagination'
import type { ItemMovement } from '../../../services/itemsService'
import { getDisplayText, getOperationTypeLabel } from '../../inventory-operations/operationForm'
import { formatMovementDate, getCounterpartyLabel, getOperationCode } from '../itemDetailsUtils'
import type { ItemMovementsDateFilterValue } from '../types'
import { ItemDetailsSummaryCard } from './ItemDetailsSummaryCard'
import { ItemMovementsDateFilter } from './ItemMovementsDateFilter'

type ItemMovementsSectionProps = {
  category: CategoryDefinition
  internalCode?: string | null
  itemCode?: string | null
  filter: ItemMovementsDateFilterValue
  movements: ItemMovement[]
  totals: { totalAdded: number; totalIssued: number }
  onFilterChange: (value: ItemMovementsDateFilterValue) => void
  onRefresh: () => void
}

export function ItemMovementsSection({ category, internalCode, itemCode, filter, movements, totals, onFilterChange, onRefresh }: ItemMovementsSectionProps) {
  const hasFilter = Boolean(filter.fromDate || filter.toDate)
  const pagination = usePagination(movements, { initialPageSize: 10 })
  const { setCurrentPage } = pagination

  useEffect(() => {
    setCurrentPage(1)
  }, [filter.fromDate, filter.toDate, setCurrentPage])

  const columns = useMemo<DataTableColumn<ItemMovement>[]>(() => [
    {
      id: 'internal_code',
      header: 'كود الصنف',
      renderCell: (row) => (
        <span dir="ltr" className="inline-block select-all font-mono font-semibold text-slate-700">
          {getDisplayText(row.internal_code || internalCode)}
        </span>
      ),
    },
    { id: 'operation_date', header: 'التاريخ', renderCell: (row) => formatMovementDate(row.operation_date) },
    { id: 'operation_type', header: 'نوع العملية', renderCell: (row) => <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.operation_type === 'add' ? 'bg-emerald-50 text-emerald-700' : row.operation_type === 'issue' ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>{getOperationTypeLabel(row.operation_type)}</span> },
    { id: 'issued_quantity', header: 'صرف', renderCell: (row) => getDisplayText(row.issued_quantity) },
    { id: 'added_quantity', header: 'إضافة', renderCell: (row) => getDisplayText(row.added_quantity) },
    { id: 'previous_balance', header: 'الرصيد قبل', renderCell: (row) => getDisplayText(row.previous_balance) },
    { id: 'new_balance', header: 'الرصيد بعد', renderCell: (row) => getDisplayText(row.new_balance) },
    { id: 'counterparty', header: 'المورد / المستلم', renderCell: (row) => getDisplayText(getCounterpartyLabel(row)) },
    { id: 'purchase_order_number', header: 'رقم أمر التوريد', renderCell: (row) => getDisplayText(row.purchase_order_number) },
    ...(category.table === 'raw_materials' || category.table === 'screws' || category.table === 'stock_screws' ? [{
      id: 'code_number',
      header: 'رقم الكود',
      renderCell: (row: ItemMovement) => getDisplayText(row.item_code || itemCode),
    }] : []),
    { id: 'operation_code', header: 'كود العملية', renderCell: (row) => getDisplayText(getOperationCode(row)) },
    { id: 'notes', header: 'ملاحظات', renderCell: (row) => <div className="max-w-[240px] whitespace-normal leading-6">{getDisplayText(row.notes)}</div> },
  ], [category.table, internalCode, itemCode])

  return <div className="min-w-0 space-y-3">
    <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-right"><h3 className="text-[1.6rem] font-bold text-slate-900">سجل الحركات</h3><p className="mt-1 text-sm text-[var(--app-text-muted)]">جميع الحركات المرتبطة بهذا الصنف مرتبة من الأحدث إلى الأقدم.</p></div>
      <button type="button" onClick={onRefresh} className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-2xl border border-[var(--app-border)] bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">تحديث البيانات</button>
    </div>
    <ItemMovementsDateFilter fromDate={filter.fromDate} toDate={filter.toDate} onFromDateChange={(fromDate) => onFilterChange({ ...filter, fromDate })} onToDateChange={(toDate) => onFilterChange({ ...filter, toDate })} onClear={() => onFilterChange({ fromDate: '', toDate: '' })} />
    <div className="grid gap-4 md:grid-cols-2">
      <ItemDetailsSummaryCard label={hasFilter ? 'إجمالي الإضافة للفترة المحددة' : 'إجمالي الإضافة لكل الحركات'} value={totals.totalAdded.toLocaleString()} toneClassName="bg-emerald-50 text-slate-900" />
      <ItemDetailsSummaryCard label={hasFilter ? 'إجمالي الصرف للفترة المحددة' : 'إجمالي الصرف لكل الحركات'} value={totals.totalIssued.toLocaleString()} toneClassName="bg-orange-50 text-slate-900" />
    </div>
    <div className="min-w-0 max-w-full overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
      {movements.length === 0 ? <div className="px-5 py-12 text-center text-sm text-slate-500">{hasFilter ? 'لا توجد حركات ضمن الفترة المحددة' : 'لا توجد حركات مسجلة لهذا الصنف حتى الآن'}</div> : <>
        <DataTable columns={columns} rows={pagination.paginatedItems} getRowKey={(row) => String(row.id)} stickyHeader maxHeightClassName="max-h-[68vh] w-full max-w-full overflow-auto overscroll-contain [scrollbar-gutter:stable]" rowClassName="hover:bg-slate-50" />
        <TablePagination currentPage={pagination.currentPage} pageSize={pagination.pageSize} totalItems={pagination.totalItems} totalPages={pagination.totalPages} pageStart={pagination.pageStart} pageEnd={pagination.pageEnd} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
      </>}
    </div>
  </div>
}
