import { TablePagination } from '../../../components/TablePagination'
import { usePagination } from '../../../hooks/usePagination'
import { getStockStatusClass, getStockStatusLabel } from '../../../utils/statusUtils'
import type { DashboardInventoryAlert } from '../types'

type InventoryAlertsTableProps = {
  rows: DashboardInventoryAlert[]
}

export function InventoryAlertsTable({ rows }: InventoryAlertsTableProps) {
  const pagination = usePagination(rows, { initialPageSize: 5 })

  if (rows.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-slate-500">
        Ù„Ø§ ØªÙˆØ¬Ø¯ Ø£ØµÙ†Ø§Ù Ø­Ø±Ø¬Ø© Ø­Ø§Ù„ÙŠØ§Ù‹.
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-right">
          <thead className="bg-[var(--app-panel-soft)] text-sm font-semibold text-slate-800">
            <tr>
              <th className="px-6 py-4">Ø§Ù„Ù‚Ø³Ù…</th>
              <th className="px-6 py-4">Ø§Ù„ØµÙ†Ù</th>
              <th className="px-6 py-4">Ø§Ù„Ø±ØµÙŠØ¯</th>
              <th className="px-6 py-4">Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰</th>
              <th className="px-6 py-4">Ø§Ù„Ø­Ø§Ù„Ø©</th>
              <th className="px-6 py-4">Ø¥Ø¬Ø±Ø§Ø¡</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {pagination.paginatedItems.map((row) => (
              <tr key={row.id}>
                <td className="px-6 py-3.5">{row.category}</td>
                <td className="px-6 py-3.5">{row.itemName}</td>
                <td className="px-6 py-3.5">{row.stockBalance}</td>
                <td className="px-6 py-3.5">{row.minQuantity}</td>
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
                <td className="px-6 py-3.5 text-slate-700">{row.actionLabel}</td>
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
