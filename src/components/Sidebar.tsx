import { useState, type ReactNode } from 'react'
import { categoryOptions } from '../config/categoryConfig'
import { SidebarNavItem } from './SidebarNavItem'
import { useAccess } from '../features/access/AccessContext'

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

function ReportIcon({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M5 20V10M12 20V4M19 20v-7" />
      <path d="M3 20h18" />
    </svg>
  )
}

function OperationsIcon({ className = '' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M5 7h14M5 12h14M5 17h14" />
      <path d="M8 4v6M16 9v6M8 14v6" />
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
    case '/reports':
      return <ReportIcon className={iconClassName} />
    case '/operations':
      return <OperationsIcon className={iconClassName} />
    case '/stocktake':
      return <OperationsIcon className={iconClassName} />
    case '/import':
      return <UploadIcon className={iconClassName} />
    case '/low-stock':
      return <AlertIcon className={iconClassName} />
    case '/item-code-guide':
      return <GuideIcon className={iconClassName} />
    case '/projects':
      return <LayersIcon className={iconClassName} />
    case '/dynamic-categories':
      return <LayersIcon className={iconClassName} />
    case '/sync-center':
      return <UploadIcon className={iconClassName} />
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
    default:
      // return <BoxIcon className={iconClassName} />
  }
}

const managementItems = [
  { label: 'لوحة التحكم', to: '/' },
  { label: 'جرد', to: '/stocktake' },
  { label: 'تقارير', to: '/reports' },
  { label: 'التنبيهات', to: '/low-stock' },
  { label: 'الموظفين والموردين', to: '/parties' },
]

const operationsItems = [
  { label: 'جميع الأقسام', to: '/' },
  { label: 'عمليات الصرف والإضافة', to: '/operations' },
  { label: 'تقارير', to: '/reports' },
  { label: 'التنبيهات', to: '/low-stock' },
]

const warehouseSectionItems = categoryOptions.map((category) => ({
  label: category.label,
  to: category.route,
}))

const inventoryExtraItems = [
  { label: 'الموظفين والموردين', to: '/parties' },
  { label: 'مركز المزامنة', to: '/sync-center' },
]

const adminItems = [
  { label: 'إدارة الأقسام', to: '/projects' },
  { label: 'التصنيفات الديناميكية', to: '/dynamic-categories' },
]

type SidebarGroupProps = {
  title: string
  children: ReactNode
  initiallyOpen?: boolean
  showWhen?: boolean
}

function SidebarGroup({
  title,
  children,
  initiallyOpen = true,
  showWhen = true,
}: SidebarGroupProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)

  if (!showWhen) return null

  return (
    <section className="rounded-2xl border border-[var(--app-sidebar-border)] bg-[var(--app-sidebar-soft)] p-2 shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-right text-[13px] font-bold text-[var(--app-sidebar-text)] transition-colors hover:bg-white/10"
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <ChevronDownIcon
          className={[
            'h-4 w-4 text-[var(--app-sidebar-text-muted)] transition-transform duration-200',
            isOpen ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {isOpen ? <div className="mt-1 space-y-1">{children}</div> : null}
    </section>
  )
}

type SidebarSubGroupProps = {
  title: string
  children: ReactNode
  initiallyOpen?: boolean
}

function SidebarSubGroup({ title, children, initiallyOpen = false }: SidebarSubGroupProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)

  return (
    <div className="rounded-xl bg-[var(--app-sidebar-soft-strong)]">
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-right text-[13px] font-semibold text-[var(--app-sidebar-text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--app-sidebar-text)]"
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <ChevronDownIcon
          className={[
            'h-3.5 w-3.5 text-[var(--app-sidebar-text-muted)] transition-transform duration-200',
            isOpen ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {isOpen ? <div className="mt-1 space-y-1 pr-2">{children}</div> : null}
    </div>
  )
}

type SidebarProps = {
  drawer?: boolean
  onClose?: () => void
}

export function Sidebar({ drawer = false, onClose }: SidebarProps) {
  const { user, lock } = useAccess()
  const isAdmin = Boolean(user?.areas.includes('management') && user?.areas.includes('inventory'))

  return (
    <aside
      className={[
        'relative bg-[var(--app-sidebar)] text-[var(--app-sidebar-text)]',
        drawer
          ? 'h-[100dvh] w-[min(86vw,340px)] overflow-y-auto shadow-[-12px_0_32px_rgba(15,15,17,0.35)]'
          : 'min-h-screen w-[260px] flex-none',
      ].join(' ')}
    >
      {drawer ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-xl text-[var(--app-sidebar-text-muted)] transition hover:bg-white/10 hover:text-[var(--app-sidebar-text)]"
          aria-label="Close navigation"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      ) : null}
      <div className="flex h-full flex-col px-[18px] pb-8 pt-7">
        <div className="mb-6 text-right">
          <h2 className="text-[25px] font-bold tracking-tight">مصنع الفــــتـــــــــــــــح</h2>
          <p className="mt-1 text-[12px] text-[var(--app-sidebar-text-muted)]">نظام إدارة المــخــــــــزون</p>
        </div>

        <nav className="flex flex-col gap-3 overflow-y-auto">
          <SidebarGroup title="الإدارة" showWhen={user?.areas.includes('management') ?? false}>
            {managementItems.map((item) => (
              <SidebarNavItem
                key={item.to}
                to={item.to}
                label={item.label}
                icon={getSidebarIcon(item.to)}
                onNavigate={onClose}
              />
            ))}
          </SidebarGroup>

          <SidebarGroup title="المخزن" showWhen={user?.areas.includes('inventory') ?? false}>
            <SidebarSubGroup title="عمليات" initiallyOpen>
              {operationsItems.map((item) => (
                <SidebarNavItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={getSidebarIcon(item.to)}
                  onNavigate={onClose}
                />
              ))}
            </SidebarSubGroup>

            <SidebarSubGroup title="اقسام المخزن">
              {warehouseSectionItems.map((item) => (
                <SidebarNavItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={getSidebarIcon(item.to)}
                  onNavigate={onClose}
                />
              ))}
            </SidebarSubGroup>

            {inventoryExtraItems.map((item) => (
              <SidebarNavItem
                key={item.to}
                to={item.to}
                label={item.label}
                icon={getSidebarIcon(item.to)}
                onNavigate={onClose}
              />
            ))}

            <SidebarNavItem
              to="/import"
              hidden={!user?.areas.includes('inventory')}
              label="استيراد البيانات"
              icon={getSidebarIcon('/import')}
              onNavigate={onClose}
            />
          </SidebarGroup>

          <SidebarGroup title="الأدمن" showWhen={isAdmin}>
            {adminItems.map((item) => (
              <SidebarNavItem
                key={item.to}
                to={item.to}
                label={item.label}
                icon={getSidebarIcon(item.to)}
                onNavigate={onClose}
              />
            ))}
          </SidebarGroup>

          <div className="rounded-2xl border border-[var(--app-sidebar-border)] bg-[var(--app-sidebar-soft)] p-2 shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
            <SidebarNavItem
              to="/item-code-guide"
              label="دليل أكواد الأصناف"
              icon={getSidebarIcon('/item-code-guide')}
              onNavigate={onClose}
            />
          </div>

          <div className="rounded-2xl border border-[var(--app-sidebar-border)] bg-[var(--app-sidebar-soft)] p-2 shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
            <button type="button" onClick={() => { lock(); onClose?.() }} className="w-full rounded-xl px-3 py-2 text-sm font-semibold text-[var(--app-sidebar-text-muted)] transition hover:bg-white/10 hover:text-[var(--app-sidebar-text)]">
             تسجيل الخروج
            </button>
          </div>
        </nav>
      </div>
    </aside>
  )
}
