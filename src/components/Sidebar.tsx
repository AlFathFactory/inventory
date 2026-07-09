import { NavLink } from 'react-router-dom'
import { categoryOptions } from '../config/categoryConfig'

const navigationItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'استيراد Excel', to: '/import' },
  ...categoryOptions.map((category) => ({
    label: category.label,
    to: category.route,
  })),
] as const

export function Sidebar() {
  return (
    <aside className="w-full border-b border-slate-200 bg-slate-950 text-white lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-l">
      <div className="flex h-full flex-col px-4 py-6 sm:px-6">
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-slate-400">
            Factory System
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Inventory MVP</h2>
        </div>

        <nav className="flex flex-1 flex-col gap-2">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                [
                  'rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white text-slate-950'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  )
}
