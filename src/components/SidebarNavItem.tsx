import { NavLink } from 'react-router-dom'

type SidebarNavItemProps = {
  label: string
  to: string
}

export function SidebarNavItem({ label, to }: SidebarNavItemProps) {
  return (
    <NavLink to={to} end={to === '/'}>
      {({ isActive }) => (
        <span
          className={[
            'flex h-9 items-center justify-between rounded-[10px] px-[18px] text-[13px] transition-colors',
            isActive
              ? 'bg-white font-semibold text-[var(--app-sidebar)]'
              : 'font-normal text-[#eef4ff] hover:bg-white/8 hover:text-white',
          ].join(' ')}
        >
          <span className="truncate">{label}</span>
          <span
            className={[
              'h-[14px] w-[14px] rounded-[4px] transition-colors',
              isActive
                ? 'bg-[var(--app-primary)]'
                : 'bg-[var(--app-sidebar-accent)]',
            ].join(' ')}
            aria-hidden="true"
          />
        </span>
      )}
    </NavLink>
  )
}
