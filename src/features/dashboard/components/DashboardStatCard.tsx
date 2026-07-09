type DashboardStatCardProps = {
  caption: string
  value: number | string
  helper: string
  accentClassName: string
}

export function DashboardStatCard({
  caption,
  value,
  helper,
  accentClassName,
}: DashboardStatCardProps) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white px-6 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <p className="text-sm font-medium text-slate-500">{caption}</p>
      <p className={['mt-4 text-5xl font-bold leading-none', accentClassName].join(' ')}>
        {value}
      </p>
      <p className="mt-3 text-sm text-slate-500">{helper}</p>
    </article>
  )
}
