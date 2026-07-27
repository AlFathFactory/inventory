import { useEffect, useMemo, useState } from 'react'
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
  latestMovementId?: string
  deletingMovementId?: string | null
  onDeleteMovement?: (movement: ItemMovement) => void
  returningMovementId?: string | null
  onReturnMovement?: (movement: ItemMovement) => void
}

export function ItemMovementsSection({ category, internalCode, itemCode, filter, movements, totals, onFilterChange, onRefresh, latestMovementId, deletingMovementId, onDeleteMovement, returningMovementId, onReturnMovement }: ItemMovementsSectionProps) {
  const hasFilter = Boolean(filter.fromDate || filter.toDate)
  const pagination = usePagination(movements, { initialPageSize: 10 })
  const { setCurrentPage } = pagination
  const [actionsMovement, setActionsMovement] = useState<ItemMovement | null>(null)

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
    { id: 'operation_type', header: 'نوع العملية', renderCell: (row) => <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.operation_type === 'add' ? 'bg-emerald-50 text-emerald-700' : row.operation_type === 'issue' ? 'bg-orange-50 text-orange-700' : row.operation_type === 'return' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>{getOperationTypeLabel(row.operation_type)}</span> },
    { id: 'issued_quantity', header: 'صرف', renderCell: (row) => getDisplayText(row.issued_quantity) },
    { id: 'added_quantity', header: 'إضافة', renderCell: (row) => getDisplayText(row.added_quantity) },
    { id: 'returned_quantity', header: 'مرتجع', renderCell: (row) => getDisplayText(row.returnedQuantity) },
    {
      id: 'return_status',
      header: 'حالة المرتجع',
      renderCell: (row) => {
        if (row.operation_type !== 'issue') return '—'
        if (row.returnStatus === 'fully_returned') {
          return (
            <div className="space-y-1">
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                مرتجع بالكامل
              </span>
              <div className="text-xs text-slate-500">تم إرجاع الكمية بالكامل</div>
            </div>
          )
        }
        if (row.returnStatus === 'partially_returned') {
          return (
            <div className="space-y-1">
              <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                مرتجع جزئي
              </span>
              <div className="text-xs text-slate-500">
                تم إرجاع {row.returnedQuantity} من {getDisplayText(row.quantity)}
              </div>
            </div>
          )
        }
        return '—'
      },
    },
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
    {
      id: 'related_operation',
      header: 'مرجع حركة الصرف',
      renderCell: (row) => row.operation_type === 'return' ? (
        <div className="max-w-[220px] whitespace-normal text-xs leading-5">
          <div dir="ltr" className="font-mono text-slate-700">
            {getDisplayText(row.original_issue_code || row.related_operation_id)}
          </div>
          <div className="text-slate-500">
            المستلم الأصلي: {getDisplayText(row.original_issued_to)}
          </div>
        </div>
      ) : '—',
    },
    { id: 'notes', header: 'ملاحظات', renderCell: (row) => <div className="max-w-[240px] whitespace-normal leading-6">{getDisplayText(row.notes)}</div> },
    ...(onDeleteMovement || onReturnMovement ? [{
      id: 'actions',
      header: 'إجراء',
      renderCell: (row: ItemMovement) => {
        const rowId = String(row.id)
        const canDelete = Boolean(onDeleteMovement && rowId === latestMovementId)
        const isIssue = row.operation_type === 'issue'
        const canShowReturn = Boolean(onReturnMovement && isIssue)
        if (!canDelete && !canShowReturn) return null

        return (
          <button
            type="button"
            aria-label="عرض إجراءات الحركة"
            onClick={() => setActionsMovement(row)}
            disabled={deletingMovementId !== null || returningMovementId !== null}
            className="inline-flex size-8 items-center justify-center rounded-full border border-slate-300 bg-slate-50 font-bold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
          >
            !
          </button>
        )
      },
    }] : []),
  ], [category.table, deletingMovementId, internalCode, itemCode, latestMovementId, onDeleteMovement, onReturnMovement, returningMovementId])

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
    {actionsMovement ? (() => {
      const actionMovementId = String(actionsMovement.id)
      const canDelete = Boolean(
        onDeleteMovement && actionMovementId === latestMovementId,
      )
      const canReturn = Boolean(
        onReturnMovement && actionsMovement.operation_type === 'issue',
      )

      return (
        <div
          dir="rtl"
          className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              deletingMovementId === null &&
              returningMovementId === null
            ) {
              setActionsMovement(null)
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="movement-actions-title"
            className="w-full max-w-sm rounded-[24px] border border-slate-200 bg-white p-5 text-right shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-50 font-bold text-slate-500"
              >
                !
              </span>
              <div>
                <h2 id="movement-actions-title" className="font-bold text-slate-900">
                  إجراءات الحركة
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  اختر الإجراء المطلوب لهذه الحركة.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    setActionsMovement(null)
                    onDeleteMovement?.(actionsMovement)
                  }}
                  disabled={deletingMovementId !== null || returningMovementId !== null}
                  className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  حذف الحركة
                </button>
              ) : null}
              {canReturn ? (
                <button
                  type="button"
                  onClick={() => {
                    setActionsMovement(null)
                    onReturnMovement?.(actionsMovement)
                  }}
                  disabled={
                    actionsMovement.remainingReturnableQuantity <= 0 ||
                    deletingMovementId !== null ||
                    returningMovementId !== null
                  }
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {actionsMovement.returnStatus === 'fully_returned'
                    ? 'مرتجع بالكامل'
                    : 'مرتجع'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setActionsMovement(null)}
                disabled={deletingMovementId !== null || returningMovementId !== null}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )
    })() : null}
  </div>
}
