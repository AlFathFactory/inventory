import { useEffect, useMemo, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { offlineDb, type OfflineItem, type OfflineOperation, type OfflineStatus } from '../lib/offlineDb'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { dismissConflictingOperation, retryFailedItem, retryFailedOperation } from '../services/offlineQueueService'
import { runOfflineSyncOnce } from '../services/offlineSyncCoordinator'
import { prepareOfflineData } from '../services/offlineBootstrapService'
import { useOfflineCacheStatus } from '../hooks/useOfflineCacheStatus'
import { TablePagination } from '../components/TablePagination'
import { usePagination } from '../hooks/usePagination'

const statusUi: Record<OfflineStatus, { label: string; className: string }> = {
  pending: { label: 'قيد الانتظار', className: 'bg-slate-100 text-slate-700' },
  syncing: { label: 'جاري المزامنة', className: 'bg-blue-50 text-blue-700' },
  synced: { label: 'تمت المزامنة', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'فشلت', className: 'bg-red-50 text-red-700' },
  conflict: { label: 'تعارض', className: 'bg-amber-50 text-amber-800' },
}

const operationLabels = { add: 'إضافة', issue: 'صرف', adjust: 'تسوية', edit_item: 'تعديل صنف' } as const

function friendlyError(message: string | null) {
  if (!message) return 'تعذر إتمام العملية. تحقق من الاتصال ثم أعد المحاولة.'
  const value = message.toLowerCase()
  if (value.includes('insufficient')) return 'الكمية المطلوبة أكبر من الرصيد المتاح.'
  if (value.includes('not found')) return 'لم يعد الصنف موجودًا أو لا يمكن الوصول إليه.'
  if (value.includes('network') || value.includes('fetch')) return 'انقطع الاتصال قبل حفظ البيانات. أعد المحاولةمرة ثانية.'
  return message
}

export function SyncCenterPage() {
  const { isOnline } = useNetworkStatus()
  const cache = useOfflineCacheStatus()
  const syncLockRef = useRef(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [items, setItems] = useState<OfflineItem[]>([])
  const [operations, setOperations] = useState<OfflineOperation[]>([])
  const operationsPagination = usePagination(operations, { initialPageSize: 10 })

  useEffect(() => {
    const subscription = liveQuery(async () => Promise.all([
      offlineDb.offline_items.toArray(), offlineDb.offline_operations.orderBy('createdAt').reverse().toArray(),
    ])).subscribe(([nextItems, nextOperations]) => {
      setItems(nextItems)
      setOperations(nextOperations)
    })
    return () => subscription.unsubscribe()
  }, [])

  const counts = useMemo(() => {
    const all = [...items, ...operations]
    return Object.fromEntries((Object.keys(statusUi) as OfflineStatus[]).map((status) => [status, all.filter((row) => row.status === status).length])) as Record<OfflineStatus, number>
  }, [items, operations])

  const generalStatus = isSyncing || counts.syncing
    ? { label: 'جاري المزامنة', className: 'bg-blue-50 text-blue-700' }
    : counts.conflict ? { label: 'توجد تعارضات', className: 'bg-amber-50 text-amber-800' }
      : counts.failed ? { label: 'توجد أخطاء', className: 'bg-red-50 text-red-700' }
        : counts.synced && !counts.pending ? { label: 'تمت المزامنة', className: 'bg-emerald-50 text-emerald-700' }
          : { label: 'جاهز للمزامنة', className: 'bg-slate-100 text-slate-700' }

  async function sync() {
    if (syncLockRef.current) return
    syncLockRef.current = true
    setIsSyncing(true)
    try { await runOfflineSyncOnce() } catch { /* Persisted statuses explain individual failures. */ }
    finally { syncLockRef.current = false; setIsSyncing(false) }
  }

  async function retryOperation(operation: OfflineOperation) {
    if (operation.status === 'syncing' || operation.status === 'synced') return
    await retryFailedOperation(operation.id)
    if (isOnline) await sync()
  }

  const lastSync = [...items, ...operations].map((row) => row.syncedAt).filter((value): value is string => Boolean(value)).sort().at(-1)
  const cacheReady = cache.metadata?.status === 'ready' || Boolean(cache.metadata?.updatedAt && cache.itemCount)

  return (
    <section className="space-y-5" dir="rtl">
      <header className="rounded-3xl border border-[var(--app-border)] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-bold">مركز المزامنة</h2><span className={`rounded-full px-3 py-1 text-xs font-bold ${generalStatus.className}`}>{generalStatus.label}</span></div>
            <p className="mt-2 text-sm text-slate-500">الاتصال: <strong className={isOnline ? 'text-emerald-600' : 'text-amber-700'}>{isOnline ? 'متصل' : 'غير متصل'}</strong></p>
          </div>
          <button type="button" disabled={!isOnline || isSyncing} onClick={() => void sync()} className="min-h-12 w-full rounded-2xl bg-[var(--app-primary)] px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" aria-busy={isSyncing}>
            {isSyncing ? <span className="flex items-center justify-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />جاري المزامنة...</span> : 'مزامنة الآن'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{(Object.keys(statusUi) as OfflineStatus[]).map((status) => <div key={status} className="rounded-2xl border border-[var(--app-border)] bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{statusUi[status].label}</p><strong className="mt-2 block text-2xl">{counts[status]}</strong><span className="text-[11px] text-slate-400">{status}</span></div>)}</div>

      <div className="rounded-3xl border border-[var(--app-border)] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h3 className="font-bold">بيانات العمل دون إنترنت</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${cacheReady ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{cache.metadata?.status === 'preparing' ? 'جاري التجهيز' : cacheReady ? 'جاهزة' : 'غير جاهزة'}</span></div><p className="mt-2 text-sm text-slate-600">آخر تحديث: {cache.metadata?.updatedAt ? new Date(cache.metadata.updatedAt).toLocaleString('ar-EG') : 'لم يتم بعد'} · {cache.itemCount} صنف · {cache.projectCount} سجل</p>{cache.metadata?.errorMessage ? <p className="mt-2 text-sm text-red-700">{friendlyError(cache.metadata.errorMessage)}</p> : null}</div><button type="button" disabled={!isOnline || cache.metadata?.status === 'preparing' || isSyncing} onClick={() => void prepareOfflineData()} className="rounded-2xl border border-[var(--app-primary)] px-5 py-3 text-sm font-bold text-[var(--app-primary)] disabled:opacity-50">تجهيز البيانات</button></div>
      </div>

      <div className="rounded-3xl border border-[var(--app-border)] bg-white p-5 sm:p-6"><h3 className="font-bold">العمليات المحلية</h3><p className="mt-1 text-sm text-slate-500">آخر مزامنة: {lastSync ? new Date(lastSync).toLocaleString('ar-EG') : 'لم تتم مزامنة بعد'}</p>
        <div className="mt-4 space-y-3">{operations.length === 0 ? <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">لا توجد عمليات محلية.</p> : operationsPagination.paginatedItems.map((operation) => {
          const itemName = String(operation.payload.itemName ?? operation.itemId ?? operation.localItemId ?? 'غير محدد')
          const date = String(operation.payload.operationDate ?? operation.createdAt)
          return <article key={operation.id} className="rounded-2xl border border-[var(--app-border)] p-4"><div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center"><div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4"><div><span className="block text-xs text-slate-500">النوع</span><strong>{operationLabels[operation.operationType]}</strong></div><div><span className="block text-xs text-slate-500">الصنف</span><strong>{itemName}</strong></div><div><span className="block text-xs text-slate-500">الكمية</span><strong>{operation.quantity ?? '—'}</strong></div><div><span className="block text-xs text-slate-500">التاريخ</span><strong>{new Date(date).toLocaleDateString('ar-EG')}</strong></div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusUi[operation.status].className}`}>{statusUi[operation.status].label}</span>{operation.status === 'failed' || operation.status === 'conflict' ? <button type="button" disabled={isSyncing} onClick={() => void retryOperation(operation)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">إعادة المحاولة</button> : null}{operation.status === 'conflict' ? <button type="button" onClick={() => void dismissConflictingOperation(operation.id)} className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-amber-800">تجاهل التعديل</button> : null}</div></div>{operation.errorMessage ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{friendlyError(operation.errorMessage)}</p> : null}{operation.syncedAt ? <p className="mt-2 text-xs text-slate-400">تمت في {new Date(operation.syncedAt).toLocaleString('ar-EG')}</p> : null}</article>
        })}</div>
        {operations.length > 0 ? <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--app-border)]">
          <TablePagination
            currentPage={operationsPagination.currentPage}
            pageSize={operationsPagination.pageSize}
            totalItems={operationsPagination.totalItems}
            totalPages={operationsPagination.totalPages}
            pageStart={operationsPagination.pageStart}
            pageEnd={operationsPagination.pageEnd}
            onPageChange={operationsPagination.setCurrentPage}
            onPageSizeChange={operationsPagination.setPageSize}
          />
        </div> : null}
      </div>

      {items.some((item) => item.status === 'failed') ? <div className="rounded-3xl border border-red-100 bg-white p-5"><h3 className="font-bold text-red-700">أصناف تعذر رفعها</h3>{items.filter((item) => item.status === 'failed').map((item) => <div key={item.localId} className="mt-3 flex flex-col gap-3 rounded-2xl bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong>{item.itemName}</strong><p className="text-xs text-red-700">{friendlyError(item.errorMessage)}</p></div><button type="button" onClick={() => void retryFailedItem(item.localId).then(() => isOnline ? sync() : undefined)} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-red-700">إعادة المحاولة</button></div>)}</div> : null}
    </section>
  )
}
