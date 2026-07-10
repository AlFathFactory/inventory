import { DataTable, type DataTableColumn } from '../../../components/DataTable'
import { TablePagination } from '../../../components/TablePagination'
import { usePagination } from '../../../hooks/usePagination'
import type { DashboardOperation } from '../types'

type RecentOperationsTableProps = {
  rows: DashboardOperation[]
}

const columns: DataTableColumn<DashboardOperation>[] = [
  {
    id: 'date',
    header: 'التاريخ',
    renderCell: (row) => row.date,
  },
  {
    id: 'operationType',
    header: 'نوع العملية',
    renderCell: (row) => row.operationType,
  },
  {
    id: 'itemName',
    header: 'الصنف',
    renderCell: (row) => row.itemName,
  },
  {
    id: 'quantity',
    header: 'الكمية',
    renderCell: (row) => row.quantity,
  },
  {
    id: 'userName',
    header: 'المستخدم',
    renderCell: (row) => row.userName,
  },
]

export function RecentOperationsTable({ rows }: RecentOperationsTableProps) {
  const pagination = usePagination(rows, { initialPageSize: 5 })

  if (rows.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-slate-500">
        لا توجد عمليات حديثة لعرضها.
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
