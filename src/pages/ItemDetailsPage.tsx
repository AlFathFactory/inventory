import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import {
  categoryConfig,
  type CategoryDefinition,
  type CategoryKey,
} from '../config/categoryConfig'
import {
  getItemDetails,
  getItemMovements,
  type ItemDetails,
  type ItemMovement,
} from '../services/itemsService'
import {
  applyInventoryOperation,
  type InventoryOperationType,
} from '../services/operationsService'
import { getStockStatusClass } from '../utils/statusUtils'

type MessageState = {
  type: 'success' | 'error'
  text: string
} | null

type OperationFormState = {
  quantity: string
  operationDate: string
  projectName: string
  supplierName: string
  purchaseOrderNumber: string
  issuedTo: string
  notes: string
}

function isCategoryKey(value: string): value is CategoryKey {
  return value in categoryConfig
}

function getTodayValue() {
  return new Date().toISOString().slice(0, 10)
}

function getDisplayText(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  return String(value)
}

function getNumericValue(value: string | number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : 0
  }

  return 0
}

function getOperationTypeLabel(operationType: string | null) {
  switch (operationType) {
    case 'add':
      return 'إضافة'
    case 'issue':
      return 'صرف'
    case 'adjust':
      return 'جرد / تعديل رصيد'
    default:
      return '—'
  }
}

function getStatusBadgeClass(status: string | null) {
  switch (status) {
    case 'آمن':
      return getStockStatusClass('safe')
    case 'قليل':
      return getStockStatusClass('low')
    case 'منتهي':
      return getStockStatusClass('out')
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function getCounterpartyLabel(row: ItemMovement) {
  if (row.operation_type === 'add') {
    return row.supplier_name
  }

  if (row.operation_type === 'issue') {
    return row.issued_to || row.received_by
  }

  return row.received_by || row.issued_to || row.supplier_name
}

function getOperationCode(row: ItemMovement) {
  if (row.operation_type === 'add') {
    return row.addition_code
  }

  if (row.operation_type === 'issue') {
    return row.issue_code
  }

  return row.addition_code || row.issue_code || row.item_code
}

function createInitialFormState(details: ItemDetails | null): OperationFormState {
  return {
    quantity: '',
    operationDate: getTodayValue(),
    projectName: details?.project_name ?? '',
    supplierName: '',
    purchaseOrderNumber: '',
    issuedTo: '',
    notes: '',
  }
}

function fieldClassName(hasError = false) {
  return [
    'h-[46px] w-full rounded-2xl border bg-white px-4 text-sm text-slate-800 outline-none transition',
    hasError
      ? 'border-red-300 focus:border-red-400'
      : 'border-[var(--app-border)] focus:border-[var(--app-primary)]',
  ].join(' ')
}

function textAreaClassName(hasError = false) {
  return [
    'min-h-[108px] w-full rounded-3xl border bg-white px-4 py-3 text-sm text-slate-800 outline-none transition',
    hasError
      ? 'border-red-300 focus:border-red-400'
      : 'border-[var(--app-border)] focus:border-[var(--app-primary)]',
  ].join(' ')
}

function SummaryCard({
  label,
  value,
  toneClassName = 'bg-slate-50 text-slate-900',
}: {
  label: string
  value: string
  toneClassName?: string
}) {
  return (
    <div className={`rounded-[24px] px-5 py-4 ${toneClassName}`}>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-[1.6rem] font-bold">{value}</div>
    </div>
  )
}

export function ItemDetailsPage() {
  const { categoryKey, itemId } = useParams()
  const [details, setDetails] = useState<ItemDetails | null>(null)
  const [movements, setMovements] = useState<ItemMovement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<MessageState>(null)
  const [operationType, setOperationType] = useState<InventoryOperationType | null>(null)
  const [form, setForm] = useState<OperationFormState>(createInitialFormState(null))
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const category: CategoryDefinition | null =
    categoryKey && isCategoryKey(categoryKey)
      ? (categoryConfig[categoryKey] as CategoryDefinition)
      : null

  async function loadItemData(activeCategory: CategoryDefinition, activeItemId: string) {
    setIsLoading(true)

    const [detailsResult, movementsResult] = await Promise.all([
      getItemDetails(activeCategory.table, activeItemId),
      getItemMovements(activeCategory.table, activeItemId),
    ])

    if (detailsResult.error) {
      setDetails(null)
      setMovements([])
      setMessage({ type: 'error', text: detailsResult.error })
      setIsLoading(false)
      return
    }

    const nextDetails = detailsResult.data

    if (!nextDetails) {
      setDetails(null)
      setMovements([])
      setMessage({ type: 'error', text: 'تعذر تحميل تفاصيل الصنف' })
      setIsLoading(false)
      return
    }

    setDetails(nextDetails)
    setMovements(movementsResult.error ? [] : movementsResult.data ?? [])

    if (movementsResult.error) {
      setMessage({ type: 'error', text: movementsResult.error })
    }

    setForm((currentForm) => ({
      ...currentForm,
      projectName: nextDetails.project_name ?? currentForm.projectName,
    }))
    setIsLoading(false)
  }

  useEffect(() => {
    if (!category || !itemId) {
      setDetails(null)
      setMovements([])
      setIsLoading(false)
      return
    }

    void loadItemData(category, itemId)
  }, [category, itemId])

  const movementColumns = useMemo<DataTableColumn<ItemMovement>[]>(
    () => [
      {
        id: 'operation_date',
        header: 'التاريخ',
        renderCell: (row) => getDisplayText(row.operation_date),
      },
      {
        id: 'operation_type',
        header: 'نوع العملية',
        renderCell: (row) => (
          <span
            className={[
              'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
              row.operation_type === 'add'
                ? 'bg-emerald-50 text-emerald-700'
                : row.operation_type === 'issue'
                  ? 'bg-orange-50 text-orange-700'
                  : 'bg-blue-50 text-blue-700',
            ].join(' ')}
          >
            {getOperationTypeLabel(row.operation_type)}
          </span>
        ),
      },
      {
        id: 'issued_quantity',
        header: 'صرف',
        renderCell: (row) => getDisplayText(row.issued_quantity),
      },
      {
        id: 'added_quantity',
        header: 'إضافة',
        renderCell: (row) => getDisplayText(row.added_quantity),
      },
      {
        id: 'total_added_until_operation',
        header: 'إجمالي المضاف',
        renderCell: (row) => getDisplayText(row.total_added_until_operation),
      },
      {
        id: 'total_issued_until_operation',
        header: 'إجمالي الصرف',
        renderCell: (row) => getDisplayText(row.total_issued_until_operation),
      },
      {
        id: 'previous_balance',
        header: 'الرصيد قبل',
        renderCell: (row) => getDisplayText(row.previous_balance),
      },
      {
        id: 'new_balance',
        header: 'الرصيد بعد',
        renderCell: (row) => getDisplayText(row.new_balance),
      },
      {
        id: 'counterparty',
        header: 'المورد / المستلم',
        renderCell: (row) => getDisplayText(getCounterpartyLabel(row)),
      },
      {
        id: 'purchase_order_number',
        header: 'رقم أمر التوريد',
        renderCell: (row) => getDisplayText(row.purchase_order_number),
      },
      {
        id: 'operation_code',
        header: 'كود العملية',
        renderCell: (row) => getDisplayText(getOperationCode(row)),
      },
      {
        id: 'notes',
        header: 'ملاحظات',
        renderCell: (row) => (
          <div className="max-w-[240px] whitespace-normal leading-6">
            {getDisplayText(row.notes)}
          </div>
        ),
      },
    ],
    [],
  )

  function openOperationModal(nextOperationType: InventoryOperationType) {
    setOperationType(nextOperationType)
    setForm(createInitialFormState(details))
    setFormErrors({})
    setMessage(null)
  }

  function closeOperationModal() {
    setOperationType(null)
    setFormErrors({})
  }

  function updateFormField<TKey extends keyof OperationFormState>(
    field: TKey,
    value: OperationFormState[TKey],
  ) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }))
    setFormErrors((currentErrors) => {
      if (!(field in currentErrors)) {
        return currentErrors
      }

      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
  }

  function validateOperationForm() {
    if (!operationType || !details) {
      return false
    }

    const nextErrors: Record<string, string> = {}
    const quantity = Number(form.quantity)
    const currentBalance = getNumericValue(details.stock_balance)

    if (!form.quantity || !Number.isFinite(quantity) || quantity <= 0) {
      nextErrors.quantity = 'الكمية مطلوبة ويجب أن تكون أكبر من صفر'
    }

    if (!form.operationDate) {
      nextErrors.operationDate = 'التاريخ مطلوب'
    }

    if ((operationType === 'add' || operationType === 'issue') && !form.projectName.trim()) {
      nextErrors.projectName = 'اسم المشروع مطلوب'
    }

    if (operationType === 'add' && !form.supplierName.trim()) {
      nextErrors.supplierName = 'اسم المورد مطلوب'
    }

    if (operationType === 'issue') {
      if (!form.issuedTo.trim()) {
        nextErrors.issuedTo = 'اسم المستلم مطلوب'
      }

      if (Number.isFinite(quantity) && quantity > currentBalance) {
        nextErrors.quantity = 'الكمية المصروفة أكبر من الرصيد الحالي'
      }
    }

    if (operationType === 'adjust' && !form.notes.trim()) {
      nextErrors.notes = 'سبب الجرد أو التعديل مطلوب'
    }

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleOperationSubmit() {
    if (!category || !itemId || !details || !operationType) {
      return
    }

    setMessage(null)

    if (!validateOperationForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      await applyInventoryOperation({
        tableName: category.table,
        categoryName: details.category_name || category.label,
        itemId,
        itemName: details.item_name || `صنف ${itemId}`,
        operationType,
        quantity: Number(form.quantity),
        operationDate: form.operationDate,
        projectName:
          operationType === 'adjust' ? undefined : form.projectName.trim() || undefined,
        supplierName:
          operationType === 'add' ? form.supplierName.trim() || undefined : undefined,
        purchaseOrderNumber:
          operationType === 'add'
            ? form.purchaseOrderNumber.trim() || undefined
            : undefined,
        issuedTo:
          operationType === 'issue' ? form.issuedTo.trim() || undefined : undefined,
        notes: form.notes.trim() || undefined,
      })

      await loadItemData(category, itemId)
      closeOperationModal()
      setMessage({
        type: 'success',
        text:
          operationType === 'add'
            ? 'تمت إضافة الكمية بنجاح'
            : operationType === 'issue'
              ? 'تم صرف الكمية بنجاح'
              : 'تم تحديث الرصيد بنجاح',
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر تنفيذ العملية',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!category || !itemId) {
    return (
      <section className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-8 shadow-[var(--app-shadow)]">
        <h1 className="text-2xl font-semibold text-slate-900">الصنف غير موجود</h1>
      </section>
    )
  }

  return (
    <section dir="rtl" className="space-y-6">
      {message ? (
        <div
          className={[
            'rounded-[24px] border px-5 py-4 text-sm',
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700',
          ].join(' ')}
        >
          {message.text}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-10 text-center text-sm text-slate-500 shadow-[var(--app-shadow)]">
          جاري تحميل بيانات الصنف...
        </div>
      ) : null}

      {!isLoading && !details ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-600">
          تعذر العثور على بيانات هذا الصنف
        </div>
      ) : null}

      {!isLoading && details ? (
        <>
          <div className="rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-6 shadow-[var(--app-shadow)] lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4 text-right">
                <div>
                  <h2 className="text-[2rem] font-bold tracking-tight text-slate-950">
                    {details.item_name || `صنف ${itemId}`}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                    شاشة تفاصيل الصنف وسجل الحركات الكامل لهذا القسم.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[22px] bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">اسم القسم</div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {details.category_name || category.label}
                    </div>
                  </div>
                  <div className="rounded-[22px] bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">اسم المشروع</div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {getDisplayText(details.project_name)}
                    </div>
                  </div>
                  <div className="rounded-[22px] bg-slate-50 px-4 py-3">
                    <div className="text-xs text-slate-500">الحالة</div>
                    <div className="mt-2">
                      <span
                        className={[
                          'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
                          getStatusBadgeClass(details.status),
                        ].join(' ')}
                      >
                        {details.status || 'غير محدد'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Link
                to={category.route}
                className="inline-flex h-[44px] items-center justify-center rounded-2xl border border-[var(--app-border)] bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                رجوع للقسم
              </Link>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-5">
              <SummaryCard
                label="الرصيد الحالي"
                value={getNumericValue(details.stock_balance).toLocaleString()}
              />
              <SummaryCard
                label="الحد الأدنى"
                value={getNumericValue(details.min_quantity).toLocaleString()}
              />
              <SummaryCard
                label="الحالة"
                value={details.status || 'غير محدد'}
                toneClassName="bg-slate-50 text-slate-900"
              />
              <SummaryCard
                label="إجمالي المضاف"
                value={getNumericValue(details.total_added).toLocaleString()}
                toneClassName="bg-emerald-50 text-slate-900"
              />
              <SummaryCard
                label="إجمالي الصرف"
                value={getNumericValue(details.total_issued).toLocaleString()}
                toneClassName="bg-orange-50 text-slate-900"
              />
            </div>

            <div className="mt-6 flex flex-wrap justify-start gap-3">
              <button
                type="button"
                onClick={() => openOperationModal('add')}
                className="inline-flex h-[44px] items-center rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                إضافة كمية
              </button>
              <button
                type="button"
                onClick={() => openOperationModal('issue')}
                className="inline-flex h-[44px] items-center rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                صرف كمية
              </button>
              <button
                type="button"
                onClick={() => openOperationModal('adjust')}
                className="inline-flex h-[44px] items-center rounded-2xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                جرد / تعديل رصيد
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="text-right">
                <h3 className="text-[1.6rem] font-bold text-slate-900">سجل الحركات</h3>
                <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                  جميع الحركات المرتبطة بهذا الصنف مرتبة من الأحدث إلى الأقدم.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadItemData(category, itemId)}
                className="inline-flex h-[42px] items-center rounded-2xl border border-[var(--app-border)] bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                تحديث البيانات
              </button>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
              {movements.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-slate-500">
                  لا توجد حركات مسجلة لهذا الصنف حتى الآن
                </div>
              ) : (
                <DataTable
                  columns={movementColumns}
                  rows={movements}
                  getRowKey={(row) => String(row.id)}
                  stickyHeader
                  maxHeightClassName="max-h-[68vh] overflow-auto"
                  rowClassName="hover:bg-slate-50"
                />
              )}
            </div>
          </div>
        </>
      ) : null}

      {operationType && details ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)] p-6 shadow-2xl lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="text-right">
                <h3 className="text-[1.5rem] font-bold text-slate-900">
                  {getOperationTypeLabel(operationType)}
                </h3>
                <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                  {details.item_name || `صنف ${itemId}`} داخل قسم {details.category_name || category.label}
                </p>
              </div>
              <button
                type="button"
                onClick={closeOperationModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                aria-label="إغلاق"
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {(operationType === 'add' || operationType === 'issue') ? (
                <label className="space-y-2 text-right">
                  <span className="block text-sm font-semibold text-slate-700">
                    اسم المشروع
                  </span>
                  <input
                    type="text"
                    value={form.projectName}
                    onChange={(event) => updateFormField('projectName', event.target.value)}
                    className={fieldClassName(Boolean(formErrors.projectName))}
                    placeholder="اكتب اسم المشروع"
                  />
                  {formErrors.projectName ? (
                    <p className="text-xs text-red-600">{formErrors.projectName}</p>
                  ) : null}
                </label>
              ) : null}

              <label className="space-y-2 text-right">
                <span className="block text-sm font-semibold text-slate-700">
                  {operationType === 'adjust' ? 'الرصيد الفعلي بعد الجرد' : 'الكمية'}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.quantity}
                  onChange={(event) => updateFormField('quantity', event.target.value)}
                  className={fieldClassName(Boolean(formErrors.quantity))}
                  placeholder={
                    operationType === 'adjust' ? 'أدخل الرصيد النهائي' : 'أدخل الكمية'
                  }
                />
                {formErrors.quantity ? (
                  <p className="text-xs text-red-600">{formErrors.quantity}</p>
                ) : null}
              </label>

              <label className="space-y-2 text-right">
                <span className="block text-sm font-semibold text-slate-700">
                  التاريخ
                </span>
                <input
                  type="date"
                  value={form.operationDate}
                  onChange={(event) => updateFormField('operationDate', event.target.value)}
                  className={fieldClassName(Boolean(formErrors.operationDate))}
                />
                {formErrors.operationDate ? (
                  <p className="text-xs text-red-600">{formErrors.operationDate}</p>
                ) : null}
              </label>

              {operationType === 'add' ? (
                <label className="space-y-2 text-right">
                  <span className="block text-sm font-semibold text-slate-700">
                    اسم المورد
                  </span>
                  <input
                    type="text"
                    value={form.supplierName}
                    onChange={(event) => updateFormField('supplierName', event.target.value)}
                    className={fieldClassName(Boolean(formErrors.supplierName))}
                    placeholder="اسم المورد"
                  />
                  {formErrors.supplierName ? (
                    <p className="text-xs text-red-600">{formErrors.supplierName}</p>
                  ) : null}
                </label>
              ) : null}

              {operationType === 'add' ? (
                <label className="space-y-2 text-right">
                  <span className="block text-sm font-semibold text-slate-700">
                    رقم أمر التوريد
                  </span>
                  <input
                    type="text"
                    value={form.purchaseOrderNumber}
                    onChange={(event) =>
                      updateFormField('purchaseOrderNumber', event.target.value)
                    }
                    className={fieldClassName()}
                    placeholder="اختياري"
                  />
                </label>
              ) : null}

              {operationType === 'issue' ? (
                <label className="space-y-2 text-right">
                  <span className="block text-sm font-semibold text-slate-700">
                    اسم المستلم
                  </span>
                  <input
                    type="text"
                    value={form.issuedTo}
                    onChange={(event) => updateFormField('issuedTo', event.target.value)}
                    className={fieldClassName(Boolean(formErrors.issuedTo))}
                    placeholder="اسم المستلم"
                  />
                  {formErrors.issuedTo ? (
                    <p className="text-xs text-red-600">{formErrors.issuedTo}</p>
                  ) : null}
                </label>
              ) : null}
            </div>

            <label className="mt-5 block space-y-2 text-right">
              <span className="block text-sm font-semibold text-slate-700">ملاحظات</span>
              <textarea
                value={form.notes}
                onChange={(event) => updateFormField('notes', event.target.value)}
                className={textAreaClassName(Boolean(formErrors.notes))}
                placeholder={
                  operationType === 'adjust'
                    ? 'اكتب سبب الجرد أو التعديل'
                    : 'أي ملاحظات إضافية'
                }
              />
              {formErrors.notes ? (
                <p className="text-xs text-red-600">{formErrors.notes}</p>
              ) : null}
            </label>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-start">
              <button
                type="button"
                onClick={closeOperationModal}
                className="h-[46px] rounded-2xl px-6 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleOperationSubmit()}
                disabled={isSubmitting}
                className="h-[46px] min-w-[200px] rounded-2xl bg-[var(--app-primary)] px-6 text-sm font-bold text-white transition hover:bg-[var(--app-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'جاري حفظ العملية...' : 'تأكيد العملية'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
