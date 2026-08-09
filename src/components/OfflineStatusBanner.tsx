import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { offlineDb } from '../lib/offlineDb'

export function OfflineStatusBanner() {
  const { connectionState } = useNetworkStatus()
  const [queuedCount, setQueuedCount] = useState(0)

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [items, operations] = await Promise.all([
        offlineDb.offline_items.filter((item) => item.status !== 'synced').count(),
        offlineDb.offline_operations.filter((operation) => operation.status !== 'synced').count(),
      ])
      return items + operations
    }).subscribe(setQueuedCount)
    return () => subscription.unsubscribe()
  }, [])

  if (connectionState === 'online' && queuedCount > 0) {
    return (
      <div className="bg-blue-600 px-4 py-2 text-center text-sm font-bold text-white" role="status">
        عاد الاتصال — يوجد {queuedCount} تغيير محلي جاهز للرفع.{' '}
        <a className="underline underline-offset-2" href="#/sync-center">افتح مركز المزامنة</a>
      </div>
    )
  }
  if (connectionState === 'online' || connectionState === 'checking') return null
  return (
    <div className="bg-amber-500 px-4 py-2 text-center text-sm font-bold text-amber-950" role="status">
      {connectionState === 'offline'
        ? 'وضع بدون إنترنت — سيتم حفظ التغييرات على هذا الجهاز حتى تختار رفعها'
        : 'يوجد اتصال بالشبكة لكن الخادم غير متاح — سيستمر العمل من البيانات المحفوظة'}
    </div>
  )
}
