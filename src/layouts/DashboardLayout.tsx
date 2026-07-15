import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { Topbar } from '../components/Topbar'
import { OfflineStatusBanner } from '../components/OfflineStatusBanner'

export function DashboardLayout() {
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-transparent text-slate-900 antialiased"
    >
      <OfflineStatusBanner />
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-6 pb-7 pt-8 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
