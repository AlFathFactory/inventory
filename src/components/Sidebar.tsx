import { categoryOptions } from '../config/categoryConfig'
import { SidebarNavItem } from './SidebarNavItem'

const navigationItems = [
  { label: 'لوحة التحكم', to: '/' },
  { label: 'الأصناف', to: '/items' },
  { label: 'المشاريع', to: '/projects' },
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
          <h2 className="text-[18px] font-bold tracking-tight">Inventory MVP</h2>
          <p className="mt-1 text-[12px] text-[#d6e4ff]">نظام إدارة المخزون</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {navigationItems.map((item) => (
            <SidebarNavItem key={item.to} to={item.to} label={item.label} />
          ))}
        </nav>
      </div>
    </aside>
  )
}
