import { getDynamicItemStockStatus } from '../dynamicItemUtils'

export function DynamicStockStatusBadge({
  stockBalance,
  minQuantity,
}: {
  stockBalance: number
  minQuantity: number | null
}) {
  const status = getDynamicItemStockStatus(stockBalance, minQuantity)
  const copy = {
    safe: { label: 'آمن', className: 'bg-emerald-50 text-emerald-700' },
    low: { label: 'قليل', className: 'bg-amber-50 text-amber-700' },
    out: { label: 'منتهي', className: 'bg-red-50 text-red-700' },
  }[status]

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${copy.className}`}>
      {copy.label}
    </span>
  )
}
