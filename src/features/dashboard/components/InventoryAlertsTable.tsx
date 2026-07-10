import { DataTable, type DataTableColumn } from '../../../components/DataTable'
import { TablePagination } from '../../../components/TablePagination'
import { usePagination } from '../../../hooks/usePagination'
import {
  getStockStatusClass,
  getStockStatusLabel,
} from '../../../utils/statusUtils'
import type { DashboardInventoryAlert } from '../types'

type InventoryAlertsTableProps = {
  rows: DashboardInventoryAlert[]
}

const columns: DataTableColumn<DashboardInventoryAlert>[] = [
  {
    id: 'category',
    header: 'القسم',
    renderCell: (row) => row.category,
  },
  {
    id: 'itemName',
    header: 'الصنف',
    renderCell: (row) => row.itemName,
  },
  {
    id: 'stockBalance',
    header: 'الرصيد',
    renderCell: (row) => row.stockBalance,
  },
  {
    id: 'minQuantity',
    header: 'الحد الأدنى',
    renderCell: (row) => row.minQuantity,
  },
  {
    id: 'status',
    header: 'الحالة',
    renderCell: (row) => (
      <span
        className={[
          'inline-flex min-w-[78px] items-center justify-center rounded-full px-3 py-1 text-xs font-bold',
          getStockStatusClass(row.status),
        ].join(' ')}
      >
        {getStockStatusLabel(row.status)}
      </span>
    ),
  },
  {
    id: 'actionLabel',
    header: 'إجراء',
    renderCell: (row) => row.actionLabel,
  },
]

export function InventoryAlertsTable({ rows }: InventoryAlertsTableProps) {
  const pagination = usePagination(rows, { initialPageSize: 5 })

  if (rows.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-slate-500">
        لا توجد أصناف حرجة حاليًا.
      </div>
    )
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={pagination.paginatedItems}
        getRowKey={(row) => row.id}
      />

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
    </>
  )
}
