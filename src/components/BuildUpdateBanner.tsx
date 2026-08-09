import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { useBuildUpdate } from '../hooks/useBuildUpdate'
import { offlineDb } from '../lib/offlineDb'

export function BuildUpdateBanner() {
  const { updateAvailable } = useBuildUpdate()
  const [unsyncedCount, setUnsyncedCount] = useState(0)

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [items, operations] = await Promise.all([
        offlineDb.offline_items.filter((item) => item.status !== 'synced').count(),
        offlineDb.offline_operations.filter((operation) => operation.status !== 'synced').count(),
      ])
      return items + operations
    }).subscribe(setUnsyncedCount)
    return () => subscription.unsubscribe()
  }, [])

  if (!updateAvailable) return null

  function reload() {
    const localWorkWarning = unsyncedCount > 0
      ? ` يوجد ${unsyncedCount} تغيير محفوظ محليًا وسيبقى محفوظًا بعد التحديث.`
      : ''
    if (window.confirm(`يتوفر إصدار جديد. هل تريد تحميله الآن؟${localWorkWarning}`)) {
      window.location.reload()
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-emerald-700 px-4 py-2 text-center text-sm font-bold text-white" role="status">
      <span>يتوفر إصدار جديد من النظام.</span>
      <button type="button" onClick={reload} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-emerald-800">
        تحديث آمن
      </button>
    </div>
  )
}
