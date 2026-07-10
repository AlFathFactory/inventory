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

export function ItemsTable({ rows }: ItemsTableProps) {
  const pagination = usePagination(rows, { initialPageSize: 10 })

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-right">
          <thead className="bg-[var(--app-panel-soft)] text-sm font-semibold text-slate-800">
            <tr>
              <th className="px-6 py-4">Ø§Ù„Ù‚Ø³Ù…</th>
              <th className="px-6 py-4">Ø§Ù„ØµÙ†Ù / Ø§Ù„Ù†ÙˆØ¹</th>
              <th className="px-6 py-4">Ø§Ù„Ù…Ø´Ø±ÙˆØ¹</th>
              <th className="px-6 py-4">Ø§Ù„Ø±ØµÙŠØ¯</th>
              <th className="px-6 py-4">Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰</th>
              <th className="px-6 py-4">Ø¢Ø®Ø± ØªØ­Ø¯ÙŠØ«</th>
              <th className="px-6 py-4">Ø§Ù„Ø­Ø§Ù„Ø©</th>
              <th className="px-6 py-4">Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {pagination.paginatedItems.map((row) => (
              <tr key={row.id}>
                <td className="px-6 py-3.5">{row.category}</td>
                <td className="px-6 py-3.5">{row.itemName}</td>
                <td className="px-6 py-3.5">{row.project}</td>
                <td className="px-6 py-3.5">{row.stockBalance}</td>
                <td className="px-6 py-3.5">{row.minQuantity}</td>
                <td className="px-6 py-3.5">{row.updatedAt}</td>
                <td className="px-6 py-3.5">
                  <span
                    className={[
                      'inline-flex min-w-[78px] items-center justify-center rounded-full px-3 py-1 text-xs font-bold',
                      getStockStatusClass(row.status),
                    ].join(' ')}
                  >
                    {getStockStatusLabel(row.status)}
                  </span>
                </td>
                <td className="px-6 py-3.5">ØªØ¹Ø¯ÙŠÙ„ / Ø­Ø°Ù</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
