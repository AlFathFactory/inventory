import { useMemo } from 'react'
import { DataTable, type DataTableColumn } from '../../../components/DataTable'
import { TablePagination } from '../../../components/TablePagination'
import type { LowStockRow } from '../types'
import { formatNumber, getAlertStatusClass, getAlertStatusLabel } from '../utils/lowStockRows'

type LowStockTableProps = { rows: LowStockRow[]; isLoading: boolean; pagination: { paginatedItems: LowStockRow[]; currentPage: number; pageSize: number; totalItems: number; totalPages: number; pageStart: number; pageEnd: number; setCurrentPage: (page: number) => void; setPageSize: (size: number) => void } }
const columns: DataTableColumn<LowStockRow>[] = [
  { id: 'status', header: 'الحالة', renderCell: (row) => <span className={['inline-flex min-w-[78px] items-center justify-center rounded-full px-3 py-1 text-xs font-bold', getAlertStatusClass(row.status)].join(' ')}>{getAlertStatusLabel(row.status)}</span> },
  { id: 'categoryLabel', header: 'المخزن', renderCell: (row) => row.categoryLabel },
  { id: 'itemName', header: 'الصنف', renderCell: (row) => <p className="font-semibold text-slate-800">{row.itemName}</p> },
  { id: 'projectName', header: 'القسم', renderCell: (row) => row.projectName ?? '—' },
  { id: 'expiryDateLabel', header: 'تاريخ الانتهاء', renderCell: (row) => row.expiryDateLabel },
  { id: 'stockBalance', header: 'الرصيد الحالي', renderCell: (row) => formatNumber(row.stockBalance) },
  { id: 'minQuantity', header: 'الحد الأدنى', renderCell: (row) => formatNumber(row.minQuantity) },
]

export function LowStockTable({ rows, isLoading, pagination }: LowStockTableProps) {
  const tableColumns = useMemo(() => rows.some((row) => row.categoryKey === 'paints') ? columns : columns.filter((column) => column.id !== 'expiryDateLabel'), [rows])
  if (isLoading) return <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-slate-500">جاري تحميل التنبيهات...</div>
  if (rows.length === 0) return <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-slate-500">لا توجد تنبيهات مطابقة للبحث الحالي.</div>
  return <div className="overflow-hidden rounded-[24px] border border-[var(--app-border)]"><DataTable columns={tableColumns} rows={pagination.paginatedItems} getRowKey={(row) => row.id} stickyHeader maxHeightClassName="max-h-[70vh] overflow-auto" tableClassName="divide-y divide-slate-200 bg-white" rowClassName="hover:bg-slate-50" /><TablePagination currentPage={pagination.currentPage} pageSize={pagination.pageSize} totalItems={pagination.totalItems} totalPages={pagination.totalPages} pageStart={pagination.pageStart} pageEnd={pagination.pageEnd} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} /></div>
}
