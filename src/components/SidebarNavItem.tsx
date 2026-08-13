import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

type SidebarNavItemProps = {
  icon: ReactNode
  label: string
  to: string
  hidden?: boolean
  onNavigate?: () => void
}

export function SidebarNavItem({ icon, label, to, hidden = false, onNavigate }: SidebarNavItemProps) {
  if (hidden) return null

  return (
    <NavLink to={to} end={to === '/'} onClick={onNavigate}>
      {({ isActive }) => (
        <span
          className={[
            'flex h-9 flex-row-reverse items-center justify-end gap-2 rounded-[10px] px-[18px] text-[13px] transition-colors',
            isActive
              ? 'bg-[var(--app-sidebar-active)] font-semibold text-[var(--app-sidebar-active-text)]'
              : 'font-normal text-[var(--app-sidebar-text-secondary)] hover:bg-white/10 hover:text-[var(--app-sidebar-text)]',
          ].join(' ')}
        >
          <span className="truncate">{label}</span>
          <span
            className={[
              'flex h-[18px] w-[18px] items-center justify-center transition-colors',
              isActive
                ? 'text-[var(--app-sidebar-active-text)]'
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
