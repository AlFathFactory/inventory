import type { ReactNode } from 'react'

type DashboardTableSectionProps = {
  title: string
  action?: ReactNode
  children: ReactNode
}

export function DashboardTableSection({
  title,
  action,
  children,
}: DashboardTableSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[1.9rem] font-bold tracking-tight text-slate-900">
          {title}
        </h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
        {children}
      </div>
    </section>
  )
}
