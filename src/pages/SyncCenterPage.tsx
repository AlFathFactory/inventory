import { useEffect, useMemo, useRef, useState } from 'react'
import { liveQuery } from 'dexie'
import { offlineDb, type OfflineItem, type OfflineOperation, type OfflineStatus } from '../lib/offlineDb'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import {
  discardOfflineOperation,
  dismissConflictingOperation,
  retryFailedItem,
  retryFailedOperation,
  updateOperationParties,
} from '../services/offlineQueueService'
import { runOfflineSyncOnce } from '../services/offlineSyncCoordinator'
import { prepareOfflineData } from '../services/offlineBootstrapService'
import { useOfflineCacheStatus } from '../hooks/useOfflineCacheStatus'
import { TablePagination } from '../components/TablePagination'
import { usePagination } from '../hooks/usePagination'
import { MultiEmployeeCombobox, PartyCombobox } from '../features/parties/PartyCombobox'
import type { Employee } from '../services/partiesService'

const statusUi: Record<OfflineStatus, { label: string; className: string }> = {
  pending: { label: 'قيد الانتظار', className: 'bg-slate-100 text-slate-700' },
  syncing: { label: 'جاري المزامنة', className: 'bg-blue-50 text-blue-700' },
  synced: { label: 'تمت المزامنة', className: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'فشلت', className: 'bg-red-50 text-red-700' },
  conflict: { label: 'تعارض', className: 'bg-amber-50 text-amber-800' },
  blocked: { label: 'بانتظار صنف', className: 'bg-violet-50 text-violet-700' },
  needs_attention: { label: 'تحتاج مراجعة', className: 'bg-orange-50 text-orange-800' },
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

function PartyResolution({ operation }: { operation: OfflineOperation }) {
  const storedEmployees = Array.isArray(operation.payload.employees)
    ? operation.payload.employees.filter((employee): employee is Pick<Employee, 'id' | 'name'> => (
        Boolean(employee) && typeof employee === 'object' && 'id' in employee && 'name' in employee
      ))
    : []
  const isGroupIssue = operation.operationType === 'issue' && (
    Array.isArray(operation.payload.employeeIds) && operation.payload.employeeIds.length > 1
  )
  const [employees, setEmployees] = useState(storedEmployees)

  if (operation.operationType === 'add') {
    return (
      <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 p-3">
        <p className="mb-2 text-xs font-bold text-orange-900">اختر موردًا نشطًا بديلًا ثم ارفع العملية مرة أخرى.</p>
        <PartyCombobox
          kind="supplier"
          onSelect={(party) => void updateOperationParties(operation.id, {
            supplierId: party.id,
            supplierName: party.name,
          })}
        />
      </div>
    )
  }

  if (operation.operationType !== 'issue') return null
  if (!isGroupIssue) {
    return (
      <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 p-3">
        <p className="mb-2 text-xs font-bold text-orange-900">اختر موظفًا نشطًا بديلًا ثم ارفع العملية مرة أخرى.</p>
        <PartyCombobox
          kind="employee"
          onSelect={(party) => void updateOperationParties(operation.id, {
            employeeId: party.id,
            employeeIds: null,
            employees: null,
            issuedTo: party.name,
          })}
        />
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 p-3">
      <p className="mb-2 text-xs font-bold text-orange-900">اختر موظفين نشطين بديلين للمجموعة.</p>
      <MultiEmployeeCombobox selected={employees} onChange={setEmployees} />
      <button
        type="button"
        disabled={employees.length < 2}
        onClick={() => void updateOperationParties(operation.id, {
          employeeId: null,
          employeeIds: employees.map((employee) => employee.id),
          employees: employees.map((employee) => ({ id: employee.id, name: employee.name })),
          issuedTo: employees.map((employee) => employee.name).join('، '),
        })}
        className="mt-3 rounded-xl bg-orange-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        حفظ المستلمين البدلاء
      </button>
    </div>
  )
}

export function SyncCenterPage() {
  const { isOnline, connectionState } = useNetworkStatus()
  const cache = useOfflineCacheStatus()
  const syncLockRef = useRef(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [actionError, setActionError] = useState('')
  const [items, setItems] = useState<OfflineItem[]>([])
  const [operations, setOperations] = useState<OfflineOperation[]>([])
  const [operationStatusFilter, setOperationStatusFilter] = useState<OfflineStatus | 'all'>('all')
  const filteredOperations = useMemo(
    () => operationStatusFilter === 'all'
      ? operations
      : operations.filter((operation) => operation.status === operationStatusFilter),
    [operationStatusFilter, operations],
  )
  const operationsPagination = usePagination(filteredOperations, { initialPageSize: 10 })

  function updateOperationStatusFilter(status: OfflineStatus | 'all') {
    setOperationStatusFilter(status)
    operationsPagination.setCurrentPage(1)
  }

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
      : counts.needs_attention ? { label: 'توجد عمليات تحتاج مراجعة', className: 'bg-orange-50 text-orange-800' }
        : counts.blocked ? { label: 'توجد عمليات بانتظار أصناف', className: 'bg-violet-50 text-violet-700' }
      : counts.failed ? { label: 'توجد أخطاء', className: 'bg-red-50 text-red-700' }
        : counts.synced && !counts.pending ? { label: 'تمت المزامنة', className: 'bg-emerald-50 text-emerald-700' }
          : { label: 'جاهز للمزامنة', className: 'bg-slate-100 text-slate-700' }

  async function sync() {
    if (syncLockRef.current) return
    syncLockRef.current = true
    setIsSyncing(true)
    setActionError('')
    try { await runOfflineSyncOnce() }
    catch (error) { setActionError(friendlyError(error instanceof Error ? error.message : null)) }
    finally { syncLockRef.current = false; setIsSyncing(false) }
  }

  async function prepare() {
    setActionError('')
    try { await prepareOfflineData() }
    catch (error) { setActionError(friendlyError(error instanceof Error ? error.message : null)) }
  }

  async function retryOperation(operation: OfflineOperation) {
    if (operation.status === 'syncing' || operation.status === 'synced') return
    await retryFailedOperation(operation.id)
  }

  async function discardOperation(operation: OfflineOperation) {
    if (!window.confirm('سيتم حذف التغيير المحلي فقط ولن يتغير رصيد الخادم. هل تريد المتابعة؟')) return
    await discardOfflineOperation(operation.id)
  }

  async function discardConflict(operation: OfflineOperation) {
    if (!window.confirm('سيتم تجاهل التعديل المحلي والإبقاء على نسخة الخادم. هل تريد المتابعة؟')) return
    await dismissConflictingOperation(operation.id)
  }

  const lastSync = [...items, ...operations].map((row) => row.syncedAt).filter((value): value is string => Boolean(value)).sort().at(-1)
  const cacheReady = cache.metadata?.status === 'ready' || Boolean(cache.metadata?.updatedAt && cache.itemCount)
  const connectionLabel = connectionState === 'online'
    ? 'متصل بالخادم'
    : connectionState === 'checking'
      ? 'جارٍ فحص الاتصال'
      : connectionState === 'server_unreachable'
        ? 'الشبكة متصلة والخادم غير متاح'
        : 'غير متصل'

  return (
    <section className="space-y-5" dir="rtl">
      <header className="rounded-3xl border border-[var(--app-border)] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-bold">مركز المزامنة</h2><span className={`rounded-full px-3 py-1 text-xs font-bold ${generalStatus.className}`}>{generalStatus.label}</span></div>
            <p className="mt-2 text-sm text-slate-500">الاتصال: <strong className={isOnline ? 'text-emerald-600' : 'text-amber-700'}>{connectionLabel}</strong></p>
          </div>
          <button type="button" disabled={!isOnline || isSyncing} onClick={() => void sync()} className="min-h-12 w-full rounded-2xl bg-[var(--app-primary)] px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" aria-busy={isSyncing}>
            {isSyncing ? <span className="flex items-center justify-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />جاري الرفع...</span> : `رفع التغييرات الآن (${counts.pending})`}
          </button>
        </div>
      </header>

      {actionError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{actionError}</div> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">{(Object.keys(statusUi) as OfflineStatus[]).map((status) => <div key={status} className="rounded-2xl border border-[var(--app-border)] bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{statusUi[status].label}</p><strong className="mt-2 block text-2xl">{counts[status]}</strong><span className="text-[11px] text-slate-400">{status}</span></div>)}</div>

      <div className="rounded-3xl border border-[var(--app-border)] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h3 className="font-bold">بيانات العمل دون إنترنت</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${cacheReady ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{cache.metadata?.status === 'preparing' ? 'جاري التجهيز' : cacheReady ? 'جاهزة — يمكنك فصل الشبكة' : 'غير جاهزة'}</span></div><p className="mt-2 text-sm text-slate-600">آخر تحديث: {cache.metadata?.updatedAt ? new Date(cache.metadata.updatedAt).toLocaleString('ar-EG') : 'لم يتم بعد'} · {cache.itemCount} صنف · {cache.projectCount} قسم · {cache.employeeCount} موظف · {cache.supplierCount} مورد</p>{cache.metadata?.errorMessage ? <p className="mt-2 text-sm text-red-700">{friendlyError(cache.metadata.errorMessage)}</p> : null}</div><button type="button" disabled={!isOnline || cache.metadata?.status === 'preparing' || isSyncing} onClick={() => void prepare()} className="rounded-2xl border border-[var(--app-primary)] px-5 py-3 text-sm font-bold text-[var(--app-primary)] disabled:opacity-50">تجهيز جلسة العمل</button></div>
      </div>

      <div className="rounded-3xl border border-[var(--app-border)] bg-white p-5 sm:p-6"><h3 className="font-bold">العمليات المحلية</h3><p className="mt-1 text-sm text-slate-500">آخر مزامنة: {lastSync ? new Date(lastSync).toLocaleString('ar-EG') : 'لم تتم مزامنة بعد'}</p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="تصفية العمليات حسب الحالة">
          <button type="button" onClick={() => updateOperationStatusFilter('all')} aria-pressed={operationStatusFilter === 'all'} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${operationStatusFilter === 'all' ? 'border-[var(--app-primary)] bg-[var(--app-primary)] text-white' : 'border-[var(--app-border)] bg-white text-slate-600 hover:bg-slate-50'}`}>
            الكل ({operations.length})
          </button>
          {(Object.keys(statusUi) as OfflineStatus[]).map((status) => {
            const statusCount = operations.filter((operation) => operation.status === status).length
            const isActive = operationStatusFilter === status
            return <button key={status} type="button" onClick={() => updateOperationStatusFilter(status)} aria-pressed={isActive} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${isActive ? 'border-[var(--app-primary)] bg-[var(--app-primary)] text-white' : 'border-[var(--app-border)] bg-white text-slate-600 hover:bg-slate-50'}`}>
              {statusUi[status].label} ({statusCount})
            </button>
          })}
        </div>
        <div className="mt-4 space-y-3">{operations.length === 0 ? <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">لا توجد عمليات محلية.</p> : filteredOperations.length === 0 ? <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">لا توجد عمليات بهذه الحالة.</p> : operationsPagination.paginatedItems.map((operation) => {
          const itemName = String(operation.payload.itemName ?? operation.itemId ?? operation.localItemId ?? 'غير محدد')
          const date = String(operation.payload.operationDate ?? operation.createdAt)
          return <article key={operation.id} className="rounded-2xl border border-[var(--app-border)] p-4"><div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center"><div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4"><div><span className="block text-xs text-slate-500">النوع</span><strong>{operationLabels[operation.operationType]}</strong></div><div><span className="block text-xs text-slate-500">الصنف</span><strong>{itemName}</strong></div><div><span className="block text-xs text-slate-500">الكمية</span><strong>{operation.quantity ?? '—'}</strong></div><div><span className="block text-xs text-slate-500">التاريخ</span><strong>{new Date(date).toLocaleDateString('ar-EG')}</strong></div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusUi[operation.status].className}`}>{statusUi[operation.status].label}</span>{operation.status === 'failed' || operation.status === 'conflict' ? <button type="button" disabled={isSyncing} onClick={() => void retryOperation(operation)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">إعادة للمعلّق</button> : null}{operation.status === 'conflict' ? <button type="button" onClick={() => void discardConflict(operation)} className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-amber-800">تجاهل التعديل</button> : null}{operation.status === 'needs_attention' ? <button type="button" onClick={() => void discardOperation(operation)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700">حذف التغيير المحلي</button> : null}</div></div>{operation.errorMessage ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{friendlyError(operation.errorMessage)}</p> : null}{operation.status === 'needs_attention' ? <PartyResolution operation={operation} /> : null}{operation.syncedAt ? <p className="mt-2 text-xs text-slate-400">تمت في {new Date(operation.syncedAt).toLocaleString('ar-EG')}</p> : null}</article>
        })}</div>
        {filteredOperations.length > 0 ? <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--app-border)]">
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

      {items.some((item) => item.status === 'failed') ? <div className="rounded-3xl border border-red-100 bg-white p-5"><h3 className="font-bold text-red-700">أصناف تعذر رفعها</h3>{items.filter((item) => item.status === 'failed').map((item) => <div key={item.localId} className="mt-3 flex flex-col gap-3 rounded-2xl bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><strong>{item.itemName}</strong><p className="text-xs text-red-700">{friendlyError(item.errorMessage)}</p></div><button type="button" onClick={() => void retryFailedItem(item.localId)} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-red-700">إعادة للمعلّق</button></div>)}</div> : null}
    </section>
  )
}
