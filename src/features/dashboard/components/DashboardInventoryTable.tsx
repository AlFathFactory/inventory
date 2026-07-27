import { DataTable, type DataTableColumn } from '../../../components/DataTable'
import { TablePagination } from '../../../components/TablePagination'
import {
  getStockStatusClass,
  getStockStatusLabel,
} from '../../../utils/statusUtils'
import type { DashboardInventoryRow } from '../types'

type DashboardInventoryTableProps = {
  rows: DashboardInventoryRow[]
  selectedCategoryKey: string
  currentPage: number
  pageSize: number
  totalItems: number
  totalPages: number
  pageStart: number
  pageEnd: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onItemClick: (row: DashboardInventoryRow) => void
  onItemPrefetch: (row: DashboardInventoryRow) => void
}

function formatNumber(value: number | null) {
  return value === null ? '—' : value.toLocaleString()
}

const defaultColumns: DataTableColumn<DashboardInventoryRow>[] = [
  {
    id: 'internalCode',
    header: 'كود الصنف',
    renderCell: (row) => (
      <span
        dir="ltr"
        onClick={(event) => event.stopPropagation()}
        className="inline-block select-all font-mono font-semibold text-slate-700"
      >
        {row.internalCode ?? '—'}
      </span>
    ),
  },
  {
    id: 'categoryLabel',
    header: 'المخزن',
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
    header: 'القسم',
    renderCell: (row) => row.projectName ?? '—',
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

function displayValue(value: string | null) {
  return value || '—'
}

const cuttingDiscsColumns: DataTableColumn<DashboardInventoryRow>[] = [
  {
    id: 'internalCode',
    header: 'كود الصنف',
    renderCell: (row) => (
      <span
        dir="ltr"
        onClick={(event) => event.stopPropagation()}
        className="inline-block select-all font-mono font-semibold text-slate-700"
      >
        {displayValue(row.internalCode)}
      </span>
    ),
  },
  {
    id: 'code',
    header: 'الكود',
    renderCell: (row) => displayValue(row.code),
  },
  {
    id: 'typeName',
    header: 'النوع',
    renderCell: (row) => displayValue(row.typeName),
  },
  {
    id: 'supplierName',
    header: 'اسم المورد',
    renderCell: (row) => displayValue(row.supplierName),
  },
  {
    id: 'receivedBy',
    header: 'المستلم',
    renderCell: (row) => displayValue(row.receivedBy),
  },
  {
    id: 'receivedDate',
    header: 'تاريخ الاستلام',
    renderCell: (row) => displayValue(row.receivedDate),
  },
  {
    id: 'scrappedDate',
    header: 'تاريخ التكهين',
    renderCell: (row) => displayValue(row.scrappedDate),
  },
]

export function DashboardInventoryTable({
  rows,
  selectedCategoryKey,
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  pageStart,
  pageEnd,
  onPageChange,
  onPageSizeChange,
  onItemClick,
  onItemPrefetch,
}: DashboardInventoryTableProps) {
  const columns =
    selectedCategoryKey === 'cutting_discs'
      ? cuttingDiscsColumns
      : defaultColumns

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
        onRowClick={onItemClick}
        onRowPrefetch={onItemPrefetch}
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
