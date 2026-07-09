import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { Topbar } from '../components/Topbar'

export function DashboardLayout() {
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-100 text-slate-900 antialiased"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col lg:flex-row-reverse">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <div className="min-h-full rounded-3xl border border-slate-200 bg-white shadow-sm">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
