import { DataTable, type DataTableColumn } from '../../../components/DataTable'
import { TablePagination } from '../../../components/TablePagination'
import {
  getStockStatusClass,
  getStockStatusLabel,
} from '../../../utils/statusUtils'
import type { DashboardInventoryRow } from '../types'

type DashboardInventoryTableProps = {
  rows: DashboardInventoryRow[]
  currentPage: number
  pageSize: number
  totalItems: number
  totalPages: number
  pageStart: number
  pageEnd: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

function formatNumber(value: number | null) {
  return value === null ? '—' : value.toLocaleString()
}

const columns: DataTableColumn<DashboardInventoryRow>[] = [
  {
    id: 'categoryLabel',
    header: 'القسم',
    renderCell: (row) => row.categoryLabel,
  },
  {
    id: 'itemName',
    header: 'الصنف',
    renderCell: (row) => (
      <p className="font-semibold text-slate-800">{row.itemName}</p>
    ),
  },
  {
    id: 'projectName',
    header: 'المشروع',
    renderCell: (row) => row.projectName ?? '—',
  },
  {
    id: 'dateLabel',
    header: 'التاريخ',
    renderCell: (row) => row.dateLabel,
  },
  {
    id: 'addedQuantity',
    header: 'إضافة',
    renderCell: (row) => formatNumber(row.addedQuantity),
  },
  {
    id: 'issuedQuantity',
    header: 'صرف',
    renderCell: (row) => formatNumber(row.issuedQuantity),
  },
  {
    id: 'stockBalance',
    header: 'الرصيد',
    renderCell: (row) => formatNumber(row.stockBalance),
  },
  {
    id: 'minQuantity',
    header: 'الحد الأدنى',
    renderCell: (row) => formatNumber(row.minQuantity),
  },
  {
    id: 'status',
    header: 'الحالة',
    renderCell: (row) =>
      row.status ? (
        <span
          className={[
            'inline-flex min-w-[78px] items-center justify-center rounded-full px-3 py-1 text-xs font-bold',
            getStockStatusClass(row.status),
          ].join(' ')}
        >
          {getStockStatusLabel(row.status)}
        </span>
      ) : (
        '—'
      ),
  },
]

export function DashboardInventoryTable({
  rows,
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  pageStart,
  pageEnd,
  onPageChange,
  onPageSizeChange,
}: DashboardInventoryTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-10 text-center text-sm text-slate-500 shadow-[var(--app-shadow)]">
        لا توجد نتائج مطابقة للفلاتر الحالية.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        stickyHeader
        maxHeightClassName="max-h-[70vh] overflow-auto"
        tableClassName="divide-y divide-slate-200"
        rowClassName="hover:bg-slate-50"
      />

      <TablePagination
        currentPage={currentPage}
        pageSize={pageSize}
        totalItems={totalItems}
        totalPages={totalPages}
        pageStart={pageStart}
        pageEnd={pageEnd}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  )
}
