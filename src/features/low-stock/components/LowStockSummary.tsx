type LowStockSummaryProps = { total: number; outOfStock: number; lowStock: number; expiring: number; expired: number }

const cards: Array<{ key: keyof LowStockSummaryProps; label: string; className: string }> = [
  { key: 'total', label: 'إجمالي النتائج', className: 'border-[var(--app-border)] bg-[var(--app-panel)] text-slate-900' },
  { key: 'outOfStock', label: 'كمية فارغة', className: 'border-red-100 bg-red-50 text-red-700' },
  { key: 'lowStock', label: 'كمية قليلة', className: 'border-amber-100 bg-amber-50 text-amber-700' },
  { key: 'expiring', label: 'تنتهي خلال شهر', className: 'border-orange-100 bg-orange-50 text-orange-700' },
  { key: 'expired', label: 'منتهي الصلاحية', className: 'border-rose-100 bg-rose-50 text-rose-700' },
]

export function LowStockSummary(props: LowStockSummaryProps) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{cards.map((card) => <div key={card.key} className={`rounded-[24px] border px-5 py-4 shadow-[var(--app-shadow)] ${card.className}`}><p className="text-sm">{card.label}</p><p className="mt-2 text-2xl font-bold">{props[card.key]}</p></div>)}</div>
}
