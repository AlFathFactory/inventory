import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { Topbar } from '../components/Topbar'

export function DashboardLayout() {
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#F4F7FB] text-slate-900 antialiased"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col lg:flex-row-reverse">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar />
          <main className="flex-1 p-5 sm:p-7 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
