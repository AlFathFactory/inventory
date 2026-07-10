import { DataTable, type DataTableColumn } from '../../../components/DataTable'
import { TablePagination } from '../../../components/TablePagination'
import { usePagination } from '../../../hooks/usePagination'
import {
  getStockStatusClass,
  getStockStatusLabel,
} from '../../../utils/statusUtils'
import type { ItemInventoryRow } from '../types'

type ItemsTableProps = {
  rows: ItemInventoryRow[]
}

const columns: DataTableColumn<ItemInventoryRow>[] = [
  {
    id: 'category',
    header: 'القسم',
    renderCell: (row) => row.category,
  },
  {
    id: 'itemName',
    header: 'الصنف / النوع',
    renderCell: (row) => row.itemName,
  },
  {
    id: 'project',
    header: 'المشروع',
    renderCell: (row) => row.project,
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
    id: 'updatedAt',
    header: 'آخر تحديث',
    renderCell: (row) => row.updatedAt,
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
    id: 'actions',
    header: 'الإجراءات',
    renderCell: () => 'تعديل / حذف',
  },
]

export function ItemsTable({ rows }: ItemsTableProps) {
  const pagination = usePagination(rows, { initialPageSize: 10 })

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
