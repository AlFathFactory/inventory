import { useEffect } from 'react'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { syncOfflineData } from '../services/syncService'
import { prepareOfflineData } from '../services/offlineBootstrapService'

export function OfflineStatusBanner() {
  const { isOnline } = useNetworkStatus()

  useEffect(() => {
    if (isOnline) {
      void syncOfflineData().then(prepareOfflineData).catch(() => {
        // The Sync Center exposes preparation failures and manual retry.
      })
    }
  }, [isOnline])

  if (isOnline) return null
  return (
    <div className="bg-amber-500 px-4 py-2 text-center text-sm font-bold text-amber-950" role="status">
      وضع بدون إنترنت — سيتم حفظ التغييرات على هذا الجهاز مؤقتًا
    </div>
  )
}
