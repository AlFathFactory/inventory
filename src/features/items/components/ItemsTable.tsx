import {
  getStockStatusClass,
  getStockStatusLabel,
} from '../../../utils/statusUtils'
import type { ItemInventoryRow } from '../types'

type ItemsTableProps = {
  rows: ItemInventoryRow[]
}

export function ItemsTable({ rows }: ItemsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-right">
        <thead className="bg-[var(--app-panel-soft)] text-sm font-semibold text-slate-800">
          <tr>
            <th className="px-6 py-4">القسم</th>
            <th className="px-6 py-4">الصنف / النوع</th>
            <th className="px-6 py-4">المشروع</th>
            <th className="px-6 py-4">الرصيد</th>
            <th className="px-6 py-4">الحد الأدنى</th>
            <th className="px-6 py-4">آخر تحديث</th>
            <th className="px-6 py-4">الحالة</th>
            <th className="px-6 py-4">الإجراءات</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
          {rows.map((row) => (
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
              <td className="px-6 py-3.5">تعديل / حذف</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
