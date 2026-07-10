import { TablePagination } from '../../../components/TablePagination'
import { usePagination } from '../../../hooks/usePagination'
import type { DashboardOperation } from '../types'

type RecentOperationsTableProps = {
  rows: DashboardOperation[]
}

export function RecentOperationsTable({ rows }: RecentOperationsTableProps) {
  const pagination = usePagination(rows, { initialPageSize: 5 })

  if (rows.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-slate-500">
        Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ù…Ù„ÙŠØ§Øª Ø­Ø¯ÙŠØ«Ø© Ù„Ø¹Ø±Ø¶Ù‡Ø§.
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-right">
          <thead className="bg-[var(--app-panel-soft)] text-sm font-semibold text-slate-800">
            <tr>
              <th className="px-6 py-4">Ø§Ù„ØªØ§Ø±ÙŠØ®</th>
              <th className="px-6 py-4">Ù†ÙˆØ¹ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©</th>
              <th className="px-6 py-4">Ø§Ù„ØµÙ†Ù</th>
              <th className="px-6 py-4">Ø§Ù„ÙƒÙ…ÙŠØ©</th>
              <th className="px-6 py-4">Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {pagination.paginatedItems.map((row) => (
              <tr key={row.id}>
                <td className="px-6 py-3.5">{row.date}</td>
                <td className="px-6 py-3.5">{row.operationType}</td>
                <td className="px-6 py-3.5">{row.itemName}</td>
                <td className="px-6 py-3.5">{row.quantity}</td>
                <td className="px-6 py-3.5">{row.userName}</td>
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
