import { Suspense, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { Topbar } from '../components/Topbar'
import { OfflineStatusBanner } from '../components/OfflineStatusBanner'
import { canAccessPath } from '../config/accessControl'
import { useAccess } from '../features/access/AccessContext'
import { BuildUpdateBanner } from '../components/BuildUpdateBanner'
import { useInventoryRealtime } from '../hooks/useInventoryRealtime'

function RouteLoadingState() {
  return (
    <div className="flex min-h-64 items-center justify-center" role="status">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
        جارٍ تحميل الصفحة...
      </div>
    </div>
  )
}

export function DashboardLayout() {
  useInventoryRealtime()
  const { user } = useAccess()
  const location = useLocation()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  useEffect(() => { setIsDrawerOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!isDrawerOpen) return
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsDrawerOpen(false) }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDrawerOpen])

  if (!user || !canAccessPath(user.areas, location.pathname)) {
    return <Navigate to="/" replace />
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-transparent text-slate-900 antialiased"
    >
      <BuildUpdateBanner />
      <OfflineStatusBanner />
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <div className="hidden lg:block"><Sidebar /></div>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar onMenuClick={() => setIsDrawerOpen(true)} />
          <main className="min-w-0 flex-1 px-4 pb-7 pt-6 sm:px-6 sm:pt-8 lg:px-8">
            <Suspense fallback={<RouteLoadingState />}><Outlet /></Suspense>
          </main>
        </div>
      </div>
      <div className={['fixed inset-0 z-40 bg-slate-950/45 transition-opacity duration-300 lg:hidden', isDrawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'].join(' ')} aria-hidden="true" onClick={() => setIsDrawerOpen(false)} />
      <div id="mobile-navigation" className={['fixed inset-y-0 right-0 z-50 transition-transform duration-300 ease-out lg:hidden', isDrawerOpen ? 'translate-x-0' : 'translate-x-full'].join(' ')} role="dialog" aria-modal="true" aria-label="Main navigation" aria-hidden={!isDrawerOpen}>
        <Sidebar drawer onClose={() => setIsDrawerOpen(false)} />
      </div>
    </div>
  )
}
