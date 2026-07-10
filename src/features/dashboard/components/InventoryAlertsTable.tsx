import { getStockStatusClass, getStockStatusLabel } from '../../../utils/statusUtils'
import type { DashboardInventoryAlert } from '../types'

type InventoryAlertsTableProps = {
  rows: DashboardInventoryAlert[]
}

export function InventoryAlertsTable({ rows }: InventoryAlertsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-slate-500">
        لا توجد أصناف حرجة حالياً.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-right">
        <thead className="bg-[var(--app-panel-soft)] text-sm font-semibold text-slate-800">
          <tr>
            <th className="px-6 py-4">القسم</th>
            <th className="px-6 py-4">الصنف</th>
            <th className="px-6 py-4">الرصيد</th>
            <th className="px-6 py-4">الحد الأدنى</th>
            <th className="px-6 py-4">الحالة</th>
            <th className="px-6 py-4">إجراء</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
          {rows.map((row) => (
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
  )
}
