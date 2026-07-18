import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { offlineDb, type OfflineItem, type OfflineOperation } from '../lib/offlineDb'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { dismissConflictingOperation, retryFailedItem, retryFailedOperation } from '../services/offlineQueueService'
import { syncOfflineData } from '../services/syncService'
import { prepareOfflineData } from '../services/offlineBootstrapService'
import { useOfflineCacheStatus } from '../hooks/useOfflineCacheStatus'

export function SyncCenterPage() {
  const { isOnline } = useNetworkStatus()
  const [isSyncing, setIsSyncing] = useState(false)
  const cache = useOfflineCacheStatus()
  const [items, setItems] = useState<OfflineItem[]>([])
  const [operations, setOperations] = useState<OfflineOperation[]>([])
  useEffect(() => {
    const subscription = liveQuery(async () => Promise.all([
      offlineDb.offline_items.toArray(), offlineDb.offline_operations.toArray(),
    ])).subscribe(([nextItems, nextOperations]) => {
      setItems(nextItems)
      setOperations(nextOperations)
    })
    return () => subscription.unsubscribe()
  }, [])
  const pendingItems = items.filter((x) => x.status === 'pending' || x.status === 'syncing')
  const pendingOperations = operations.filter((x) => x.status === 'pending' || x.status === 'syncing')
  const failures = [
    ...items.filter((x) => x.status === 'failed').map((x) => ({ id: x.localId, kind: 'item' as const, label: x.itemName, error: x.errorMessage })),
    ...operations.filter((x) => x.status === 'failed').map((x) => ({ id: x.id, kind: 'operation' as const, label: `${x.operationType} — ${x.tableName}`, error: x.errorMessage })),
  ]
  const conflicts = operations.filter((x) => x.status === 'conflict')
  const lastSync = [...items, ...operations].map((x) => x.syncedAt).filter(Boolean).sort().at(-1)

  async function sync() {
    setIsSyncing(true)
    try {
      await syncOfflineData()
      await prepareOfflineData()
    } catch {
      // Synchronization/cache failures remain persisted and visible on this page.
    } finally {
      setIsSyncing(false)
    }
  }

  async function retry(kind: 'item' | 'operation', id: string) {
    if (kind === 'item') await retryFailedItem(id)
    else await retryFailedOperation(id)
    if (isOnline) await sync()
  }

  async function discardConflict(id: string) {
    await dismissConflictingOperation(id)
  }

  async function prepare() {
    try {
      await prepareOfflineData()
    } catch {
      // The persisted cache status below presents the failure to the user.
    }
  }

  const cacheStatus = cache.metadata?.status === 'preparing'
    ? { label: 'جاري التجهيز', className: 'bg-amber-50 text-amber-700' }
    : cache.metadata?.status === 'ready' || Boolean(cache.metadata?.updatedAt && cache.itemCount > 0)
      ? { label: 'جاهزة', className: 'bg-emerald-50 text-emerald-700' }
      : { label: 'غير جاهزة', className: 'bg-slate-100 text-slate-700' }

  const cards = [
    ['أصناف في انتظار الرفع', pendingItems.length],
    ['عمليات في انتظار المزامنة', pendingOperations.length],
    ['عمليات فشلت', failures.length],
    ['عمليات تمت مزامنتها', operations.filter((x) => x.status === 'synced').length],
  ] as const

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-2xl font-bold">مركز المزامنة</h2><p className="mt-1 text-sm text-slate-500">حالة الاتصال: <strong className={isOnline ? 'text-emerald-600' : 'text-amber-600'}>{isOnline ? 'متصل' : 'غير متصل'}</strong></p></div>
        <button type="button" disabled={!isOnline || isSyncing} onClick={() => void sync()} className="rounded-2xl bg-[var(--app-primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{isSyncing ? 'جاري المزامنة...' : 'مزامنة الآن'}</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-3xl border border-[var(--app-border)] bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><strong className="mt-2 block text-3xl">{value}</strong></div>)}</div>
      <div className="rounded-3xl border border-[var(--app-border)] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3"><h3 className="font-bold">بيانات العمل بدون إنترنت</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${cacheStatus.className}`}>{cacheStatus.label}</span></div>
            <p className="mt-3 text-sm text-slate-600">آخر تحديث للبيانات المحلية: {cache.metadata?.updatedAt ? new Date(cache.metadata.updatedAt).toLocaleString('ar-EG') : 'لم يتم التجهيز بعد'}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600"><span>الأصناف المحفوظة محليًا: <strong>{cache.itemCount}</strong></span><span>المشاريع المحفوظة محليًا: <strong>{cache.projectCount}</strong></span></div>
            {cache.metadata?.errorMessage ? <p className="mt-3 text-sm text-red-600">{cache.metadata.errorMessage}</p> : null}
          </div>
          <button type="button" disabled={!isOnline || cache.metadata?.status === 'preparing'} onClick={() => void prepare()} className="rounded-2xl border border-[var(--app-primary)] px-5 py-3 text-sm font-bold text-[var(--app-primary)] disabled:opacity-50">{cache.metadata?.status === 'preparing' ? 'جاري التجهيز...' : 'تجهيز البيانات للعمل بدون إنترنت'}</button>
        </div>
      </div>
      <div className="rounded-3xl border border-[var(--app-border)] bg-white p-6"><h3 className="font-bold">آخر مزامنة</h3><p className="mt-2 text-sm text-slate-600">{lastSync ? new Date(lastSync).toLocaleString('ar-EG') : 'لم تتم مزامنة بيانات بعد'}</p></div>
      {failures.length ? <div className="rounded-3xl border border-red-100 bg-white p-6"><h3 className="font-bold text-red-700">فشل الرفع</h3><div className="mt-4 space-y-3">{failures.map((failure) => <div key={`${failure.kind}-${failure.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-red-50 p-4"><div><p className="font-semibold">{failure.label}</p><p className="mt-1 text-xs text-red-700">{failure.error}</p></div><button type="button" onClick={() => void retry(failure.kind, failure.id)} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-red-700 shadow-sm">إعادة المحاولة</button></div>)}</div></div> : null}
      {conflicts.length ? <div className="rounded-3xl border border-amber-200 bg-white p-6"><h3 className="font-bold text-amber-800">تعارضات تحتاج مراجعة</h3><div className="mt-4 space-y-3">{conflicts.map((conflict) => <div key={conflict.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-4"><div><p className="font-semibold">{`${conflict.operationType} — ${conflict.tableName}`}</p><p className="mt-1 text-xs text-amber-800">{conflict.errorMessage}</p></div><div className="flex gap-2"><button type="button" onClick={() => void retry('operation', conflict.id)} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-amber-800 shadow-sm">إعادة المحاولة</button><button type="button" onClick={() => void discardConflict(conflict.id)} className="rounded-xl border border-amber-300 px-4 py-2 text-xs font-bold text-amber-800">تجاهل التعديل المحلي</button></div></div>)}</div></div> : null}
    </section>
  )
}
