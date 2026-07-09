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
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[2rem] font-bold tracking-tight text-slate-900">
          {title}
        </h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        {children}
      </div>
    </section>
  )
}
