type ItemDetailsSummaryCardProps = {
  label: string
  value: string
  toneClassName?: string
}

export function ItemDetailsSummaryCard({
  label,
  value,
  toneClassName = 'bg-slate-50 text-slate-900',
}: ItemDetailsSummaryCardProps) {
  return (
    <div className={`rounded-[24px] px-5 py-4 ${toneClassName}`}>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-[1.6rem] font-bold">{value}</div>
    </div>
  )
}
