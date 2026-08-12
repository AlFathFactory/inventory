import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useToast } from '../components/ToastProvider'
import { useAccess } from '../features/access/AccessContext'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { DeleteMovementDialog } from '../features/item-details/components/DeleteMovementDialog'
import {
  ReturnMovementDialog,
  type ReturnMovementForm,
} from '../features/item-details/components/ReturnMovementDialog'
import { DynamicItemOperationDialog, type DynamicOperationSubmission } from '../features/dynamic-categories/components/DynamicItemOperationDialog'
import { DynamicItemFormDialog } from '../features/dynamic-categories/components/DynamicItemFormDialog'
import { DynamicStockStatusBadge } from '../features/dynamic-categories/components/DynamicStockStatusBadge'
import {
  dynamicCategoryQueryOptions,
  dynamicItemMovementsQueryOptions,
  dynamicItemQueryOptions,
  invalidateDynamicItemStockData,
  useSetDynamicItemArchived,
  useUpdateDynamicItem,
} from '../features/dynamic-categories/dynamicCategoryQueries'
import { DynamicResourceNotFoundError } from '../features/dynamic-categories/dynamicCategoryService'
import { getDynamicCategoryItemsRoute } from '../features/dynamic-categories/dynamicCategoryRoutes'
import type { DynamicItemEditInput } from '../features/dynamic-categories/types'
import {
  applyDynamicItemStockOperation,
  returnDynamicItemStock,
} from '../features/dynamic-categories/dynamicItemOperationService'
import {
  deleteInventoryOperation,
  type InventoryOperationType,
} from '../services/operationsService'
import type { ItemMovement } from '../services/itemsService'

const arabicNumber = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 })
const arabicDateTime = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
const arabicDate = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' })

function formatDate(value: string | null, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return withTime ? arabicDateTime.format(date) : arabicDate.format(date)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'تعذر تنفيذ العملية.'
}

export function DynamicItemDetailsPage() {
  const { categoryId = '', itemId = '' } = useParams()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { user } = useAccess()
  const { isOnline, connectionState } = useNetworkStatus()
  const categoryQuery = useQuery(dynamicCategoryQueryOptions(categoryId))
  const itemQuery = useQuery(dynamicItemQueryOptions(itemId, categoryId))
  const movementsQuery = useQuery(dynamicItemMovementsQueryOptions(itemId))
  const updateMutation = useUpdateDynamicItem(categoryId)
  const archiveMutation = useSetDynamicItemArchived(categoryId)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [operationType, setOperationType] = useState<InventoryOperationType | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [isSubmittingOperation, setIsSubmittingOperation] = useState(false)
  const [returnMovement, setReturnMovement] = useState<ItemMovement | null>(null)
  const [returnRequestId, setReturnRequestId] = useState<string | null>(null)
  const [returnError, setReturnError] = useState<string | null>(null)
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false)
  const [deleteMovement, setDeleteMovement] = useState<ItemMovement | null>(null)
  const [isDeletingMovement, setIsDeletingMovement] = useState(false)
  const category = categoryQuery.data
  const item = itemQuery.data
  const isReadOnly = Boolean(category?.is_archived)
  const operationsDisabled = isReadOnly || Boolean(item?.is_archived) || !isOnline

  async function editItem(input: DynamicItemEditInput) {
    if (!item) return
    setFormError(null)
    try {
      await updateMutation.mutateAsync({ itemId: item.id, input })
      setIsEditOpen(false)
      showToast('تم تحديث بيانات الصنف دون تغيير الكود أو الرصيد.')
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  async function toggleArchive() {
    if (!item) return
    const isArchived = !item.is_archived
    if (isArchived && !window.confirm(`هل تريد أرشفة الصنف «${item.item_name}»؟`)) return
    try {
      await archiveMutation.mutateAsync({ itemId: item.id, isArchived })
      showToast(isArchived ? 'تمت أرشفة الصنف.' : 'تمت استعادة الصنف.')
    } catch (error) {
      showToast(errorMessage(error), 'error')
    }
  }

  function openOperation(nextType: InventoryOperationType) {
    if (!isOnline) {
      showToast('عمليات الأصناف الديناميكية تتطلب اتصالًا مباشرًا بقاعدة البيانات.', 'error')
      return
    }
    setOperationError(null)
    setOperationType(nextType)
  }

  async function submitOperation({ operationType: submittedType, form }: DynamicOperationSubmission) {
    if (!category || !item || isSubmittingOperation) return
    setIsSubmittingOperation(true)
    setOperationError(null)
    try {
      await applyDynamicItemStockOperation({
        category,
        item,
        operationType: submittedType,
        quantity: Number(form.quantity),
        operationDate: form.operationDate,
        requestId: form.requestId || '',
        supplierName: form.supplierName.trim() || undefined,
        supplierId: form.supplierId,
        purchaseOrderNumber: form.purchaseOrderNumber.trim() || undefined,
        issuedTo: form.issuedTo.trim() || undefined,
        employeeId: form.employeeId,
        employeeIds:
          submittedType === 'issue' && form.recipientMode === 'multiple'
            ? form.employeeIds?.map((employee) => employee.id)
            : undefined,
        employeeSelections:
          submittedType === 'issue' && form.recipientMode === 'multiple'
            ? form.employeeIds?.map((employee) => ({ id: employee.id, name: employee.name }))
            : undefined,
        notes: form.notes.trim() || undefined,
        createdBy: user?.name || 'user',
      })
      await invalidateDynamicItemStockData(queryClient, categoryId, itemId)
      setOperationType(null)
      showToast(
        submittedType === 'add'
          ? 'تمت إضافة الكمية بنجاح.'
          : submittedType === 'issue'
            ? 'تم صرف الكمية بنجاح.'
            : 'تم تحديث الرصيد الفعلي بنجاح.',
      )
    } catch (error) {
      setOperationError(errorMessage(error))
    } finally {
      setIsSubmittingOperation(false)
    }
  }

  function openReturn(movement: ItemMovement) {
    if (movement.operation_type !== 'issue' || movement.remainingReturnableQuantity <= 0) return
    if (!isOnline) {
      showToast('يجب الاتصال بالإنترنت لتسجيل المرتجع.', 'error')
      return
    }
    setReturnMovement(movement)
    setReturnRequestId(crypto.randomUUID())
    setReturnError(null)
  }

  async function submitReturn(form: ReturnMovementForm) {
    if (!returnMovement || !returnRequestId || isSubmittingReturn) return
    setIsSubmittingReturn(true)
    setReturnError(null)
    try {
      await returnDynamicItemStock({
        issueOperationId: String(returnMovement.id),
        quantity: Number(form.quantity),
        operationDate: form.operationDate,
        receivedBy: form.receivedBy,
        notes: form.notes,
        createdBy: user?.name || 'user',
        requestId: returnRequestId,
        employeeId: form.employeeId || null,
      })
      await invalidateDynamicItemStockData(queryClient, categoryId, itemId)
      setReturnMovement(null)
      setReturnRequestId(null)
      showToast('تم تسجيل المرتجع وتحديث الرصيد بنجاح.')
    } catch (error) {
      setReturnError(errorMessage(error))
      showToast(errorMessage(error), 'error')
    } finally {
      setIsSubmittingReturn(false)
    }
  }

  async function confirmDeleteMovement() {
    if (!deleteMovement || isDeletingMovement) return
    setIsDeletingMovement(true)
    try {
      await deleteInventoryOperation(String(deleteMovement.id), user?.name || 'user')
      await invalidateDynamicItemStockData(queryClient, categoryId, itemId)
      setDeleteMovement(null)
      showToast('تم حذف أحدث حركة واسترجاع الرصيد السابق بنجاح.')
    } catch (error) {
      showToast(errorMessage(error), 'error')
    } finally {
      setIsDeletingMovement(false)
    }
  }

  if (
    categoryQuery.error instanceof DynamicResourceNotFoundError ||
    itemQuery.error instanceof DynamicResourceNotFoundError
  ) {
    return (
      <section dir="rtl" className="rounded-[28px] border border-[var(--app-border)] bg-white px-6 py-16 text-center shadow-[var(--app-shadow)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">؟</div>
        <h2 className="mt-5 text-xl font-black text-slate-900">الصنف المطلوب غير موجود في هذا التصنيف</h2>
        <Link to={getDynamicCategoryItemsRoute(categoryId)} className="mt-6 inline-flex rounded-xl bg-[var(--app-primary)] px-5 py-2.5 text-sm font-bold text-white">العودة إلى الأصناف</Link>
      </section>
    )
  }

  const pageError = categoryQuery.error ?? itemQuery.error
  if (pageError) {
    return <section dir="rtl" className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-12 text-center"><h2 className="font-black text-red-800">تعذر تحميل تفاصيل الصنف</h2><p className="mt-2 text-sm text-red-700">{errorMessage(pageError)}</p><button type="button" onClick={() => { void categoryQuery.refetch(); void itemQuery.refetch() }} className="mt-5 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white">إعادة المحاولة</button></section>
  }

  if (categoryQuery.isPending || itemQuery.isPending || !category || !item) {
    return <section dir="rtl" className="space-y-5"><div className="h-48 animate-pulse rounded-[28px] bg-white shadow-[var(--app-shadow)]" /><div className="h-80 animate-pulse rounded-[28px] bg-white shadow-[var(--app-shadow)]" /></section>
  }

  return (
    <section dir="rtl" className="space-y-6">
      <div className={`overflow-hidden rounded-[28px] border bg-white shadow-[var(--app-shadow)] ${item.is_archived || category.is_archived ? 'border-slate-300' : 'border-[var(--app-border)]'}`}>
        {category.is_archived || item.is_archived ? <div className="border-b border-slate-200 bg-slate-100 px-6 py-3 text-sm font-bold text-slate-700">{category.is_archived ? 'التصنيف مؤرشف؛ صفحة الصنف متاحة للعرض فقط.' : 'هذا الصنف مؤرشف، ويمكن استعادته دون فقد بياناته أو حركاته.'}</div> : null}
        <div className="p-6 sm:p-8">
          <Link to={getDynamicCategoryItemsRoute(categoryId)} className="inline-flex items-center gap-2 text-sm font-bold text-[var(--app-primary)] hover:underline"><span aria-hidden="true">→</span>العودة إلى أصناف {category.name}</Link>
          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-black text-slate-950 sm:text-3xl">{item.item_name}</h2><DynamicStockStatusBadge stockBalance={item.stock_balance} minQuantity={item.min_quantity} />{item.is_archived ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">مؤرشف</span> : null}</div>
              <p dir="ltr" className="mt-3 text-left font-mono text-sm font-black text-slate-600">{item.internal_code || 'لم يُولد كود داخلي'}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={isReadOnly || item.is_archived} onClick={() => { setFormError(null); setIsEditOpen(true) }} className="h-11 rounded-2xl bg-blue-50 px-5 text-sm font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">تعديل البيانات</button>
              <button type="button" disabled={isReadOnly || archiveMutation.isPending} onClick={() => void toggleArchive()} className={`h-11 rounded-2xl px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${item.is_archived ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.is_archived ? 'استعادة الصنف' : 'أرشفة الصنف'}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-[var(--app-border)] bg-white p-5 shadow-[var(--app-shadow)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="text-lg font-black text-slate-900">عمليات المخزون</h3><p className="mt-1 text-sm text-slate-500">سجّل حركة واحدة آمنة ومحمية من التكرار للصنف الحالي.</p></div>
          {!isOnline ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{connectionState === 'checking' ? 'جارٍ التحقق من الاتصال' : 'العمليات تتطلب اتصالًا بالإنترنت'}</span> : null}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OperationButton label="إضافة" description="زيادة الرصيد" tone="emerald" disabled={operationsDisabled} onClick={() => openOperation('add')} />
          <OperationButton label="صرف" description="صرف لموظف أو مجموعة" tone="red" disabled={operationsDisabled || item.stock_balance <= 0} onClick={() => openOperation('issue')} />
          <OperationButton label="مرتجع" description="من حركة صرف محددة" tone="blue" disabled={operationsDisabled || !(movementsQuery.data ?? []).some((movement) => movement.operation_type === 'issue' && movement.remainingReturnableQuantity > 0)} onClick={() => document.getElementById('dynamic-movements')?.scrollIntoView({ behavior: 'smooth' })} />
          <OperationButton label="تسوية" description="الرصيد الفعلي الجديد" tone="amber" disabled={operationsDisabled} onClick={() => openOperation('adjust')} />
        </div>
        {!operationsDisabled && !(movementsQuery.data ?? []).some((movement) => movement.operation_type === 'issue' && movement.remainingReturnableQuantity > 0) ? <p className="mt-3 text-xs text-slate-500">لا توجد حركة صرف متاحة للمرتجع حاليًا.</p> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[28px] border border-[var(--app-border)] bg-white p-5 shadow-[var(--app-shadow)] sm:p-6">
          <h3 className="text-lg font-black text-slate-900">ملخص المخزون</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="الرصيد الحالي" value={arabicNumber.format(item.stock_balance)} tone="blue" />
            <Metric label="الحد الأدنى" value={arabicNumber.format(item.min_quantity ?? 0)} tone="slate" />
            <Metric label="إجمالي الإضافة" value={arabicNumber.format(item.total_added)} tone="emerald" />
            <Metric label="إجمالي الصرف" value={arabicNumber.format(item.total_issued)} tone="amber" />
          </div>
          <dl className="mt-6 grid gap-x-6 gap-y-5 border-t border-slate-100 pt-6 sm:grid-cols-2">
            <Detail label="التصنيف" value={category.name} />
            <Detail label="كود التصنيف" value={category.code_prefix} ltr />
            <Detail label="المشروع" value={item.project} />
            <Detail label="المورد" value={item.supplier_name} />
            <Detail label="الرصيد الافتتاحي" value={arabicNumber.format(item.opening_balance)} />
            <Detail label="تاريخ المعاملة" value={formatDate(item.transaction_date)} />
            <Detail label="تاريخ الإنشاء" value={formatDate(item.created_at, true)} />
            <Detail label="آخر تحديث" value={formatDate(item.updated_at, true)} />
          </dl>
        </div>

        <aside className="rounded-[28px] border border-[var(--app-border)] bg-white p-5 shadow-[var(--app-shadow)] sm:p-6">
          <h3 className="text-lg font-black text-slate-900">ملاحظات الصنف</h3>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{item.notes || 'لا توجد ملاحظات مسجلة.'}</p>
          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">الكود الداخلي والتصنيف لا يتغيران عند تنفيذ عمليات المخزون. التسوية تستقبل الرصيد الفعلي النهائي وليست فرقًا حسابيًا.</div>
        </aside>
      </div>

      <div id="dynamic-movements" className="scroll-mt-6 rounded-[28px] border border-[var(--app-border)] bg-white p-4 shadow-[var(--app-shadow)] sm:p-6">
        <div><h3 className="text-lg font-black text-slate-900">سجل الحركات</h3><p className="mt-1 text-sm text-slate-500">الحركات المسجلة للصنف من جدول الحركة الموحّد.</p></div>
        {movementsQuery.isPending ? <div className="mt-6 space-y-3">{[0, 1, 2].map((row) => <div key={row} className="h-16 animate-pulse rounded-2xl bg-slate-50" />)}</div> : null}
        {movementsQuery.isError ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-center text-sm text-red-700">{errorMessage(movementsQuery.error)}<button type="button" onClick={() => void movementsQuery.refetch()} className="mr-3 font-bold underline">إعادة المحاولة</button></div> : null}
        {!movementsQuery.isPending && !movementsQuery.isError && (movementsQuery.data?.length ?? 0) === 0 ? <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm font-semibold text-slate-600">لا توجد حركات مسجلة لهذا الصنف.</div> : null}
        {(movementsQuery.data?.length ?? 0) > 0 ? <MovementsTable movements={movementsQuery.data ?? []} latestMovementId={String(movementsQuery.data?.[0]?.id ?? '')} actionsDisabled={operationsDisabled || isSubmittingReturn || isDeletingMovement} onReturn={openReturn} onDelete={setDeleteMovement} /> : null}
      </div>

      {isEditOpen ? <DynamicItemFormDialog mode="edit" categoryId={categoryId} item={item} isSaving={updateMutation.isPending} error={formError} onClose={() => { if (!updateMutation.isPending) setIsEditOpen(false) }} onSubmit={editItem} /> : null}
      {operationType ? <DynamicItemOperationDialog category={category} item={item} operationType={operationType} isSubmitting={isSubmittingOperation} error={operationError} onClose={() => { if (!isSubmittingOperation) setOperationType(null) }} onSubmit={submitOperation} /> : null}
      {returnMovement ? <><ReturnMovementDialog movement={returnMovement} internalCode={item.internal_code} categoryLabel={category.name} isSubmitting={isSubmittingReturn} allocations={(returnMovement.employeeAllocations ?? []).map((allocation, index) => ({ ...allocation, id: `${returnMovement.id}-${allocation.employee_id}-${index}`, issue_operation_id: String(returnMovement.id) }))} onCancel={() => { if (!isSubmittingReturn) { setReturnMovement(null); setReturnRequestId(null) } }} onSubmit={(form) => void submitReturn(form)} />{returnError ? <div role="alert" className="fixed bottom-5 left-1/2 z-[100] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-bold text-red-700 shadow-xl">{returnError}</div> : null}</> : null}
      {deleteMovement ? <DeleteMovementDialog movement={deleteMovement} isDeleting={isDeletingMovement} onCancel={() => { if (!isDeletingMovement) setDeleteMovement(null) }} onConfirm={() => void confirmDeleteMovement()} /> : null}
    </section>
  )
}

function OperationButton({ label, description, tone, disabled, onClick }: { label: string; description: string; tone: 'emerald' | 'red' | 'blue' | 'amber'; disabled: boolean; onClick: () => void }) {
  const className = { emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800', red: 'border-red-200 bg-red-50 text-red-800', blue: 'border-blue-200 bg-blue-50 text-blue-800', amber: 'border-amber-200 bg-amber-50 text-amber-800' }[tone]
  return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-2xl border p-4 text-right transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 ${className}`}><span className="block font-black">{label}</span><span className="mt-1 block text-xs opacity-75">{description}</span></button>
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'slate' | 'emerald' | 'amber' }) {
  const className = { blue: 'bg-blue-50 text-blue-800', slate: 'bg-slate-50 text-slate-800', emerald: 'bg-emerald-50 text-emerald-800', amber: 'bg-amber-50 text-amber-800' }[tone]
  return <div className={`rounded-2xl p-4 ${className}`}><p className="text-xs font-bold opacity-70">{label}</p><p className="mt-2 text-xl font-black">{value}</p></div>
}

function Detail({ label, value, ltr = false }: { label: string; value: string | null; ltr?: boolean }) {
  return <div><dt className="text-xs font-bold text-slate-500">{label}</dt><dd dir={ltr ? 'ltr' : undefined} className={`mt-1 text-sm font-bold text-slate-800 ${ltr ? 'text-left font-mono' : ''}`}>{value || '—'}</dd></div>
}

function operationCopy(type: string) {
  return {
    add: { label: 'إضافة', className: 'bg-emerald-50 text-emerald-700' },
    issue: { label: 'صرف', className: 'bg-red-50 text-red-700' },
    return: { label: 'مرتجع', className: 'bg-blue-50 text-blue-700' },
    adjust: { label: 'تسوية', className: 'bg-amber-50 text-amber-700' },
  }[type] ?? { label: type, className: 'bg-slate-100 text-slate-700' }
}

function MovementsTable({
  movements,
  latestMovementId,
  actionsDisabled,
  onReturn,
  onDelete,
}: {
  movements: ItemMovement[]
  latestMovementId: string
  actionsDisabled: boolean
  onReturn: (movement: ItemMovement) => void
  onDelete: (movement: ItemMovement) => void
}) {
  return (
    <>
      <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-[var(--app-border)] md:block">
        <table className="min-w-full text-right text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-600">
            <tr><th className="px-4 py-4">النوع</th><th className="px-4 py-4">الكمية</th><th className="px-4 py-4">الرصيد</th><th className="px-4 py-4">المرتجع</th><th className="px-4 py-4">المورد / المستلم</th><th className="px-4 py-4">المرجع</th><th className="px-4 py-4">التاريخ</th><th className="px-4 py-4">الإجراءات</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {movements.map((movement) => {
              const copy = operationCopy(movement.operation_type ?? '')
              const canReturn = movement.operation_type === 'issue' && movement.remainingReturnableQuantity > 0
              const canDelete = String(movement.id) === latestMovementId
              return (
                <tr key={movement.id}>
                  <td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${copy.className}`}>{copy.label}</span></td>
                  <td className="px-4 py-4 font-black">{arabicNumber.format(Number(movement.quantity ?? 0))}</td>
                  <td className="whitespace-nowrap px-4 py-4"><span>{movement.previous_balance == null ? '—' : arabicNumber.format(Number(movement.previous_balance))}</span><span className="mx-2 text-slate-400">←</span><span className="font-bold">{movement.new_balance == null ? '—' : arabicNumber.format(Number(movement.new_balance))}</span></td>
                  <td className="px-4 py-4"><ReturnState movement={movement} /></td>
                  <td className="px-4 py-4"><p className="font-semibold text-slate-700">{movement.operation_type === 'add' ? movement.supplier_name || '—' : movement.issued_to || movement.received_by || '—'}</p>{movement.purchase_order_number ? <p className="mt-1 text-xs text-slate-500">أمر: {movement.purchase_order_number}</p> : null}</td>
                  <td className="px-4 py-4"><p dir="ltr" className="font-mono text-xs text-slate-600">{movement.internal_code || movement.item_code || '—'}</p>{movement.notes ? <p className="mt-1 max-w-48 truncate text-xs text-slate-500">{movement.notes}</p> : null}</td>
                  <td className="px-4 py-4">{formatDate(movement.operation_date)}</td>
                  <td className="px-4 py-4"><div className="flex gap-2">{canReturn ? <button type="button" disabled={actionsDisabled} onClick={() => onReturn(movement)} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-40">مرتجع</button> : null}{canDelete ? <button type="button" disabled={actionsDisabled} onClick={() => onDelete(movement)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40">حذف</button> : null}</div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-3 md:hidden">
        {movements.map((movement) => {
          const copy = operationCopy(movement.operation_type ?? '')
          const canReturn = movement.operation_type === 'issue' && movement.remainingReturnableQuantity > 0
          const canDelete = String(movement.id) === latestMovementId
          return (
            <article key={movement.id} className="rounded-2xl border border-[var(--app-border)] p-4">
              <div className="flex items-center justify-between gap-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${copy.className}`}>{copy.label}</span><span className="font-black text-slate-900">{arabicNumber.format(Number(movement.quantity ?? 0))}</span></div>
              <div className="mt-4 flex justify-between text-sm text-slate-600"><span>{movement.previous_balance == null ? '—' : arabicNumber.format(Number(movement.previous_balance))}</span><span>←</span><span className="font-bold">{movement.new_balance == null ? '—' : arabicNumber.format(Number(movement.new_balance))}</span></div>
              <div className="mt-3"><ReturnState movement={movement} /></div>
              <p className="mt-3 text-xs text-slate-500">{formatDate(movement.operation_date)}</p>
              <p className="mt-2 text-sm text-slate-600">{movement.supplier_name || movement.issued_to || movement.received_by || '—'}</p>
              {movement.notes ? <p className="mt-2 text-sm text-slate-600">{movement.notes}</p> : null}
              {canReturn || canDelete ? <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">{canReturn ? <button type="button" disabled={actionsDisabled} onClick={() => onReturn(movement)} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-40">تسجيل مرتجع</button> : null}{canDelete ? <button type="button" disabled={actionsDisabled} onClick={() => onDelete(movement)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40">حذف أحدث حركة</button> : null}</div> : null}
            </article>
          )
        })}
      </div>
    </>
  )
}

function ReturnState({ movement }: { movement: ItemMovement }) {
  if (movement.operation_type !== 'issue') return <span className="text-slate-400">—</span>
  if (movement.returnStatus === 'fully_returned') return <div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">مرتجع بالكامل</span><p className="mt-2 text-xs text-slate-500">المتبقي: ٠</p></div>
  if (movement.returnStatus === 'partially_returned') return <div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">مرتجع جزئي</span><p className="mt-2 text-xs text-slate-500">{arabicNumber.format(movement.returnedQuantity)} مرتجع · {arabicNumber.format(movement.remainingReturnableQuantity)} متبقي</p></div>
  return <p className="text-xs text-slate-500">المتاح: {arabicNumber.format(movement.remainingReturnableQuantity)}</p>
}
