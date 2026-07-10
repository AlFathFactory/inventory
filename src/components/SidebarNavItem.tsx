import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

type SidebarNavItemProps = {
  label: string
  to: string
  icon?: ReactNode
}

export function SidebarNavItem({ label, to, icon }: SidebarNavItemProps) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'flex h-9 items-center justify-between rounded-2xl px-[18px] text-sm font-medium transition-all',
          isActive
            ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.08)]'
            : 'text-slate-100/90 hover:bg-white/8 hover:text-white',
        ].join(' ')
      }
    >
      <span className="truncate">{label}</span>
      {icon}
    </NavLink>
  )
}
