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
    <article className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-4 shadow-[var(--app-shadow)]">
      <p className="text-sm font-medium text-[var(--app-text-muted)]">{caption}</p>
      <p className={['mt-3 text-[2.5rem] font-bold leading-none', accentClassName].join(' ')}>
        {value}
      </p>
      <p className="mt-2 text-sm text-[var(--app-text-muted)]">{helper}</p>
    </article>
  )
}
