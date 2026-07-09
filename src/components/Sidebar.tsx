import { categoryOptions } from '../config/categoryConfig'
import { SidebarNavItem } from './SidebarNavItem'

const navigationItems = [
  { label: 'لوحة التحكم', to: '/' },
  { label: 'العمليات', to: '/operations' },
  { label: 'الأصناف', to: '/items' },
  { label: 'المشاريع', to: '/projects' },
  { label: 'استيراد Excel', to: '/import' },
  { label: 'الأصناف القليلة', to: '/low-stock' },
  { label: 'الأصناف المنتهية', to: '/out-of-stock' },
  ...categoryOptions.map((category) => ({
    label: category.label,
    to: category.route,
  })),
] as const

export function Sidebar() {
  return (
    <aside className="w-full bg-[#1E2D7D] text-white lg:min-h-screen lg:w-[260px]">
      <div className="flex h-full flex-col px-4 py-6 sm:px-5">
        <div className="mb-8 text-center">
          <h2 className="text-[2rem] font-bold tracking-tight">Inventory MVP</h2>
          <p className="mt-2 text-sm text-blue-100/80">نظام إدارة المخزون</p>
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto">
          {navigationItems.map((item) => (
            <SidebarNavItem
              key={item.to}
              to={item.to}
              label={item.label}
              icon={
                <span className="h-3 w-3 rounded-[4px] bg-[#6E7CFF]" aria-hidden="true" />
              }
            />
          ))}
        </nav>
      </div>
    </aside>
  )
}
