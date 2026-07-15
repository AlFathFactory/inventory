import { useState, type ReactNode } from 'react'
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

// function BoxIcon({ className = '' }: IconProps) {
//   return (
//     <svg
//       viewBox="0 0 24 24"
//       fill="none"
//       stroke="currentColor"
//       strokeWidth="1.8"
//       className={className}
//     >
//       <path d="m12 3 7 4v10l-7 4-7-4V7l7-4Z" />
//       <path d="m5 7 7 4 7-4M12 11v10" />
//     </svg>
//   )
// }

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

function GuideIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v11.5H8.5A3.5 3.5 0 0 1 5 16V4.5Z" />
      <path d="M8.5 16H19M9 8h6M9 11h5" />
    </svg>
  )
}

function ChevronDownIcon({ className = '' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function getSidebarIcon(path: string) {
  const iconClassName = 'h-[18px] w-[18px]'

  switch (path) {
    case '/':
      return <DashboardIcon className={iconClassName} />
    case '/import':
      return <UploadIcon className={iconClassName} />
    case '/low-stock':
      return <AlertIcon className={iconClassName} />
    case '/item-code-guide':
      return <GuideIcon className={iconClassName} />
    case '/projects':
      return <LayersIcon className={iconClassName} />
    case '/category/consumables':
      return <LayersIcon className={iconClassName} />
    case '/category/paints':
      return <DropletIcon className={iconClassName} />
    case '/category/screws':
      return <NutIcon className={iconClassName} />
    case '/category/stock_screws':
      return <NutIcon className={iconClassName} />
    case '/category/raw_materials':
      // return <BoxIcon className={iconClassName} />
    case '/category/cutting_discs':
      return <DiscIcon className={iconClassName} />
    case '/category/cylinders':
      return <CylinderIcon className={iconClassName} />
    case '/category/long_welding_gloves':
      return <GloveIcon className={iconClassName} />
    default:
      // return <BoxIcon className={iconClassName} />
  }
}

const managementItems = [
  { label: 'لوحة التحكم', to: '/' },
  { label: 'التنبيهات', to: '/low-stock' },
  { label: 'إدارة المشاريع', to: '/projects' },
]

const inventoryItems = categoryOptions.map((category) => ({
  label: category.label,
  to: category.route,
}))

type SidebarGroupProps = {
  title: string
  children: ReactNode
  initiallyOpen?: boolean
}

function SidebarGroup({
  title,
  children,
  initiallyOpen = true,
}: SidebarGroupProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)

  return (
    <section className="rounded-2xl border border-white/20 bg-white/[0.035] p-2">
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-right text-[13px] font-bold text-white transition-colors hover:bg-white/8"
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <ChevronDownIcon
          className={[
            'h-4 w-4 text-[#b9cff8] transition-transform duration-200',
            isOpen ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {isOpen ? <div className="mt-1 space-y-1">{children}</div> : null}
    </section>
  )
}

export function Sidebar() {
  return (
    <aside className="w-full bg-[var(--app-sidebar)] text-white lg:min-h-screen lg:w-[260px] lg:flex-none">
      <div className="flex h-full flex-col px-[18px] pb-8 pt-7">
        <div className="mb-6 text-right">
          <h2 className="text-[25px] font-bold tracking-tight">مصنع الفــــتـــــــــــــــح</h2>
          <p className="mt-1 text-[12px] text-[#d6e4ff]">نظام إدارة المــخــــــــزون</p>
        </div>

        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <SidebarGroup title="الإدارة">
            {managementItems.map((item) => (
              <SidebarNavItem
                key={item.to}
                to={item.to}
                label={item.label}
                icon={getSidebarIcon(item.to)}
              />
            ))}
          </SidebarGroup>

          <SidebarGroup title="المخزن">
            {inventoryItems.map((item) => (
              <SidebarNavItem
                key={item.to}
                to={item.to}
                label={item.label}
                icon={getSidebarIcon(item.to)}
              />
            ))}
            <SidebarNavItem
              to="/import"
              label="استيراد البيانات"
              icon={getSidebarIcon('/import')}
            />
          </SidebarGroup>

          <div className="rounded-2xl border border-white/20 bg-white/[0.035] p-2">
            <SidebarNavItem
              to="/item-code-guide"
              label="دليل أكواد الأصناف"
              icon={getSidebarIcon('/item-code-guide')}
            />
          </div>
        </nav>
      </div>
    </aside>
  )
}
