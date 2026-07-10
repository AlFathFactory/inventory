import type { DashboardOperation } from '../types'

type RecentOperationsTableProps = {
  rows: DashboardOperation[]
}

export function RecentOperationsTable({ rows }: RecentOperationsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-slate-500">
        لا توجد عمليات حديثة لعرضها.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-right">
        <thead className="bg-[var(--app-panel-soft)] text-sm font-semibold text-slate-800">
          <tr>
            <th className="px-6 py-4">التاريخ</th>
            <th className="px-6 py-4">نوع العملية</th>
            <th className="px-6 py-4">الصنف</th>
            <th className="px-6 py-4">الكمية</th>
            <th className="px-6 py-4">المستخدم</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
          {rows.map((row) => (
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
  )
}
