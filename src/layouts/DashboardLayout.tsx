import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { Topbar } from '../components/Topbar'
import { OfflineStatusBanner } from '../components/OfflineStatusBanner'
import { canAccessPath } from '../config/accessControl'
import { useAccess } from '../features/access/AccessContext'

export function DashboardLayout() {
  const { user } = useAccess()
  const location = useLocation()

  if (!user || !canAccessPath(user.areas, location.pathname)) {
    return <Navigate to="/" replace />
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-transparent text-slate-900 antialiased"
    >
      <OfflineStatusBanner />
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="min-w-0 flex-1 px-4 pb-7 pt-8 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
