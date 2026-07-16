import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

type SidebarNavItemProps = {
  icon: ReactNode
  label: string
  to: string
  hidden?: boolean
}

export function SidebarNavItem({ icon, label, to, hidden = false }: SidebarNavItemProps) {
  if (hidden) return null

  return (
    <NavLink to={to} end={to === '/'}>
      {({ isActive }) => (
        <span
          className={[
            'flex h-9 flex-row-reverse items-center justify-end gap-2 rounded-[10px] px-[18px] text-[13px] transition-colors',
            isActive
              ? 'bg-white font-semibold text-[var(--app-sidebar)]'
              : 'font-normal text-[#eef4ff] hover:bg-white/8 hover:text-white',
          ].join(' ')}
        >
          <span className="truncate">{label}</span>
          <span
            className={[
              'flex h-[18px] w-[18px] items-center justify-center transition-colors',
              isActive
                ? 'text-[var(--app-primary)]'
                : 'text-[var(--app-sidebar-accent)]',
            ].join(' ')}
            aria-hidden="true"
          >
            {icon}
          </span>
        </span>
      )}
    </NavLink>
  )
}
