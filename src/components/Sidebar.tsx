import { categoryOptions } from '../config/categoryConfig'
import { SidebarNavItem } from './SidebarNavItem'

type IconProps = {
  className?: string
}

function DashboardIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M4 13.5h6.5V20H4zM13.5 4H20v6.5h-6.5zM13.5 13.5H20V20h-6.5zM4 4h6.5v6.5H4z" />
    </svg>
  )
}

function BoxIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="m12 3 7 4v10l-7 4-7-4V7l7-4Z" />
      <path d="m5 7 7 4 7-4M12 11v10" />
    </svg>
  )
}

function FolderIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M3.5 7.5h5l2 2h10v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M3.5 7.5v-1a2 2 0 0 1 2-2h3l2 2h8a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function UploadIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M12 16V5" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      <path d="M4 18.5h16" />
    </svg>
  )
}

function AlertIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M12 4 3.5 19h17Z" />
      <path d="M12 9v4.5M12 17h.01" />
    </svg>
  )
}

function OperationsIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M8 7h10" />
      <path d="M8 12h10" />
      <path d="M8 17h10" />
      <path d="m5 7 1.5 1.5L9 6" />
      <path d="m5 17 1.5 1.5L9 16" />
      <path d="m5 12 1.5 1.5L9 11" />
    </svg>
  )
}

function DropletIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M12 3.5c3.2 4 5.5 6.8 5.5 10a5.5 5.5 0 1 1-11 0c0-3.2 2.3-6 5.5-10Z" />
    </svg>
  )
}

function NutIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="m9 4.5 6 0 4 4v7l-4 4H9l-4-4v-7z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  )
}

function LayersIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </svg>
  )
}

function DiscIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

function CylinderIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <ellipse cx="12" cy="6.5" rx="5.5" ry="2.5" />
      <path d="M6.5 6.5v11c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-11" />
      <path d="M6.5 12c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5" />
    </svg>
  )
}

function GloveIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M8 11V6.5a1 1 0 1 1 2 0V10" />
      <path d="M10 10V5.5a1 1 0 1 1 2 0V10" />
      <path d="M12 10V6a1 1 0 1 1 2 0v5" />
      <path d="M14 11V7.5a1 1 0 1 1 2 0V14a6 6 0 0 1-6 6H8.5A3.5 3.5 0 0 1 5 16.5V11a1.5 1.5 0 1 1 3 0Z" />
    </svg>
  )
}

function getSidebarIcon(path: string) {
  const iconClassName = 'h-[18px] w-[18px]'

  switch (path) {
    case '/':
      return <DashboardIcon className={iconClassName} />
    case '/items':
      return <BoxIcon className={iconClassName} />
    case '/projects':
      return <FolderIcon className={iconClassName} />
    case '/operations':
      return <OperationsIcon className={iconClassName} />
    case '/import':
      return <UploadIcon className={iconClassName} />
    case '/low-stock':
      return <AlertIcon className={iconClassName} />
    case '/category/consumables':
      return <LayersIcon className={iconClassName} />
    case '/category/paints':
      return <DropletIcon className={iconClassName} />
    case '/category/cones4_materials':
      return <LayersIcon className={iconClassName} />
    case '/category/screws':
      return <NutIcon className={iconClassName} />
    case '/category/stock_screws':
      return <NutIcon className={iconClassName} />
    case '/category/raw_materials':
      return <BoxIcon className={iconClassName} />
    case '/category/cutting_discs':
      return <DiscIcon className={iconClassName} />
    case '/category/cylinders':
      return <CylinderIcon className={iconClassName} />
    case '/category/long_welding_gloves':
      return <GloveIcon className={iconClassName} />
    default:
      return <BoxIcon className={iconClassName} />
  }
}

const navigationItems = [
  { label: 'لوحة التحكم', to: '/' },
  { label: 'الأصناف', to: '/items' },
  { label: 'المشاريع', to: '/projects' },
  { label: 'مركز العمليات', to: '/operations' },
  { label: 'استيراد Excel', to: '/import' },
  { label: 'الأصناف القليلة', to: '/low-stock' },
  ...categoryOptions.map((category) => ({
    label: category.label,
    to: category.route,
  })),
] as const

export function Sidebar() {
  return (
    <aside className="w-full bg-[var(--app-sidebar)] text-white lg:min-h-screen lg:w-[260px] lg:flex-none">
      <div className="flex h-full flex-col px-[18px] pb-8 pt-7">
        <div className="mb-6 text-right">
          <h2 className="text-[18px] font-bold tracking-tight">مصنع الفتح</h2>
          <p className="mt-1 text-[12px] text-[#d6e4ff]">نظام إدارة المخزون</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {navigationItems.map((item) => (
            <SidebarNavItem
              key={item.to}
              to={item.to}
              label={item.label}
              icon={getSidebarIcon(item.to)}
            />
          ))}
        </nav>
      </div>
    </aside>
  )
}
