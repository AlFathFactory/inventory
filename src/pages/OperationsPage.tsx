import { useEffect, useMemo, useState } from 'react'
import { getLocalDateString } from '../utils/dateUtils'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { operationCategoryOptions } from '../config/categoryConfig'
import {
  getCategoryRows,
  type InventoryRow,
} from '../services/inventoryService'
import {
  applyInventoryOperation,
  getRecentInventoryOperations,
  type InventoryOperationType,
  type RecentInventoryOperation,
} from '../services/operationsService'

type OperationView = InventoryOperationType | 'history'

type OperationItemRow = InventoryRow

type FormState = {
  categoryKey: string
  projectName: string
  itemId: string
  itemCode: string
  quantity: string
  operationDate: string
  supplierName: string
  purchaseOrderNumber: string
  issuedTo: string
  notes: string
}

type MessageState = {
  type: 'success' | 'error'
  text: string
} | null

const operationCards: Array<{
  key: OperationView
  title: string
  hint: string
}> = [
  {
    key: 'add',
    title: 'إضافة للمخزون',
    hint: 'تسجيل توريد جديد مع تحديث الرصيد وإضافة الحركة للسجل.',
  },
  {
    key: 'issue',
    title: 'صرف من المخزون',
    hint: 'صرف كمية من الصنف مع التحقق من الرصيد الحالي قبل الحفظ.',
  },
  {
    key: 'adjust',
    title: 'جرد / تعديل رصيد',
    hint: 'تحديث الرصيد الفعلي للصنف بعد الجرد وإثبات الحركة في السجل.',
  },
  {
    key: 'history',
    title: 'سجل الحركات',
    hint: 'مراجعة آخر الإضافات وعمليات الصرف والتعديلات من مكان واحد.',
  },
]

function getTodayValue() {
  return getLocalDateString()
}

function createInitialFormState(): FormState {
  return {
    categoryKey: operationCategoryOptions[0]?.key ?? '',
    projectName: '',
    itemId: '',
    itemCode: '',
    quantity: '',
    operationDate: getTodayValue(),
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
    'min-h-[120px] w-full rounded-3xl border bg-white px-4 py-3 text-sm text-slate-800 outline-none transition',
    hasError
      ? 'border-red-300 focus:border-red-400'
      : 'border-[var(--app-border)] focus:border-[var(--app-primary)]',
  ].join(' ')
}

function labelClassName() {
  return 'space-y-2 text-right'
}

function getItemCodeValue(row: OperationItemRow) {
  const candidateKeys = ['item_code', 'code_number', 'code', 'itemCode']

  for (const key of candidateKeys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return ''
}

function getNumericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function formatHistoryOperationType(value: InventoryOperationType) {
  if (value === 'add') {
    return 'إضافة'
  }

  if (value === 'issue') {
    return 'صرف'
  }

  return 'جرد'
}

function getOperationSuccessMessage(view: InventoryOperationType) {
  if (view === 'add') {
    return 'تم تسجيل إضافة المخزون بنجاح'
  }

  if (view === 'issue') {
    return 'تم تسجيل صرف المخزون بنجاح'
  }

  return 'تم حفظ الجرد وتحديث الرصيد بنجاح'
}

export function OperationsPage() {
  const [activeView, setActiveView] = useState<OperationView>('add')
  const [form, setForm] = useState<FormState>(createInitialFormState)
  const [items, setItems] = useState<OperationItemRow[]>([])
  const [historyRows, setHistoryRows] = useState<RecentInventoryOperation[]>([])
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<MessageState>(null)
  const [isItemsLoading, setIsItemsLoading] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedCategory = useMemo(
    () =>
      operationCategoryOptions.find((category) => category.key === form.categoryKey) ??
      null,
    [form.categoryKey],
  )

  const selectedItem = useMemo(
    () =>
      items.find((item) => String(item.id ?? '') === form.itemId) ?? null,
    [form.itemId, items],
  )

  const currentBalance = useMemo(() => {
    if (!selectedCategory || !selectedItem) {
      return 0
    }

    return getNumericValue(selectedItem[selectedCategory.stockField])
  }, [selectedCategory, selectedItem])

  const quantityValue = Number(form.quantity) || 0

  const balanceAfterOperation = useMemo(() => {
    if (activeView === 'issue') {
      return currentBalance - quantityValue
    }

    if (activeView === 'adjust') {
      return quantityValue
    }

    return currentBalance + quantityValue
  }, [activeView, currentBalance, quantityValue])

  async function loadItems(categoryKey: string) {
    const category = operationCategoryOptions.find((entry) => entry.key === categoryKey)

    if (!category) {
      setItems([])
      return
    }

    setIsItemsLoading(true)

    const result = await getCategoryRows<OperationItemRow>(category.table)

    if (result.error) {
      setItems([])
      setMessage({ type: 'error', text: result.error })
    } else {
      setItems(result.data ?? [])
    }

    setIsItemsLoading(false)
  }

  async function loadHistory() {
    setIsHistoryLoading(true)

    try {
      const rows = await getRecentInventoryOperations(18)
      setHistoryRows(rows)
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر تحميل سجل الحركات',
      })
    } finally {
      setIsHistoryLoading(false)
    }
  }

  useEffect(() => {
    void loadItems(form.categoryKey)
  }, [form.categoryKey])

  useEffect(() => {
    void loadHistory()
  }, [])

  useEffect(() => {
    if (!selectedItem) {
      return
    }

    const nextCode = getItemCodeValue(selectedItem)

    setForm((currentForm) =>
      currentForm.itemCode === nextCode
        ? currentForm
        : { ...currentForm, itemCode: nextCode },
    )
  }, [selectedItem])

  const historyColumns = useMemo<DataTableColumn<RecentInventoryOperation>[]>(
    () => [
      {
        id: 'code',
        header: 'الكود',
        renderCell: (row) => row.code || '—',
      },
      {
        id: 'operationType',
        header: 'نوع الحركة',
        renderCell: (row) => (
          <span
            className={[
              'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
              row.operationType === 'add'
                ? 'bg-emerald-50 text-emerald-700'
                : row.operationType === 'issue'
                  ? 'bg-orange-50 text-orange-700'
                  : 'bg-blue-50 text-blue-700',
            ].join(' ')}
          >
            {formatHistoryOperationType(row.operationType)}
          </span>
        ),
      },
      {
        id: 'categoryName',
        header: 'القسم',
        renderCell: (row) => row.categoryName || '—',
      },
      {
        id: 'itemName',
        header: 'اسم الصنف',
        renderCell: (row) => row.itemName || '—',
      },
      {
        id: 'quantity',
        header: 'الكمية',
        renderCell: (row) => row.quantity.toLocaleString(),
      },
      {
        id: 'projectName',
        header: 'المشروع',
        renderCell: (row) => row.projectName || '—',
      },
      {
        id: 'operationDate',
        header: 'التاريخ',
        renderCell: (row) => row.operationDate || '—',
      },
      {
        id: 'counterparty',
        header: 'المورد / المستلم',
        renderCell: (row) => row.supplierName || row.issuedTo || '—',
      },
    ],
    [],
  )

  function updateForm<TKey extends keyof FormState>(field: TKey, value: FormState[TKey]) {
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

  function handleCategoryChange(value: string) {
    setFormErrors({})
    setMessage(null)
    setForm((currentForm) => ({
      ...currentForm,
      categoryKey: value,
      itemId: '',
      itemCode: '',
    }))
  }

  function resetForm(operationType: InventoryOperationType) {
    setForm({
      ...createInitialFormState(),
      categoryKey: form.categoryKey,
      operationDate: getTodayValue(),
    })
    setFormErrors({})
    setActiveView(operationType)
  }

  function validateForm() {
    const nextErrors: Record<string, string> = {}

    if (!selectedCategory) {
      nextErrors.categoryKey = 'القسم مطلوب'
    }

    if (!form.itemId) {
      nextErrors.itemId = 'الصنف مطلوب'
    }

    const quantity = Number(form.quantity)
    if (
      !form.quantity ||
      !Number.isFinite(quantity) ||
      (activeView === 'adjust' ? quantity < 0 : quantity <= 0)
    ) {
      nextErrors.quantity =
        activeView === 'adjust'
          ? 'الرصيد الفعلي يجب أن يكون صفراً أو أكبر'
          : 'الكمية مطلوبة ويجب أن تكون أكبر من صفر'
    }

    if (!form.operationDate) {
      nextErrors.operationDate = 'التاريخ مطلوب'
    }

    if ((activeView === 'add' || activeView === 'issue') && !form.projectName.trim()) {
      nextErrors.projectName = 'اسم المشروع مطلوب'
    }

    if (activeView === 'add' && !form.supplierName.trim()) {
      nextErrors.supplierName = 'اسم المورد مطلوب'
    }

    if (activeView === 'issue') {
      if (!form.issuedTo.trim()) {
        nextErrors.issuedTo = 'اسم الشخص الذي تم الصرف له مطلوب'
      }

      if (Number(form.quantity) > currentBalance) {
        nextErrors.quantity = 'الكمية المصروفة أكبر من الرصيد الحالي'
      }
    }

    if (activeView === 'adjust' && !form.notes.trim()) {
      nextErrors.notes = 'ملاحظات الجرد مطلوبة'
    }

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit() {
    if (activeView === 'history') {
      return
    }

    setMessage(null)

    if (!validateForm() || !selectedCategory || !selectedItem) {
      return
    }

    const itemName = String(selectedItem[selectedCategory.itemNameField] ?? '')

    setIsSubmitting(true)

    try {
      await applyInventoryOperation({
        tableName: selectedCategory.table,
        categoryName: selectedCategory.label,
        itemId: form.itemId,
        itemName,
        operationType: activeView,
        quantity: Number(form.quantity),
        operationDate: form.operationDate,
        projectName: form.projectName.trim() || undefined,
        itemCode: form.itemCode.trim() || undefined,
        supplierName: activeView === 'add' ? form.supplierName.trim() : undefined,
        purchaseOrderNumber:
          activeView === 'add' ? form.purchaseOrderNumber.trim() || undefined : undefined,
        issuedTo: activeView === 'issue' ? form.issuedTo.trim() : undefined,
        notes: form.notes.trim() || undefined,
      })

      setMessage({ type: 'success', text: getOperationSuccessMessage(activeView) })
      resetForm(activeView)
      await Promise.all([loadItems(selectedCategory.key), loadHistory()])
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر تنفيذ العملية',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="space-y-8">
      <div className="rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-6 shadow-[var(--app-shadow)] lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl text-right">
            <h2 className="text-[2rem] font-bold tracking-tight text-slate-950">
              مركز عمليات المخزون
            </h2>
            <p className="mt-2 text-sm leading-7 text-[var(--app-text-muted)]">
              إدارة الإضافة والصرف والجرد مع تحديث جدول القسم وتسجيل الحركة بشكل
              فوري داخل قاعدة البيانات.
            </p>
          </div>
          <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-5 py-4 text-right text-sm text-blue-700">
            <div className="font-semibold">آخر سجل معروض</div>
            <div className="mt-1">{historyRows.length} حركة حديثة</div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {operationCards.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => setActiveView(card.key)}
              className={[
                'rounded-[26px] border px-5 py-5 text-right shadow-[var(--app-shadow)] transition',
                activeView === card.key
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-[var(--app-border)] bg-[var(--app-panel-soft)] hover:border-blue-100 hover:bg-blue-50/60',
              ].join(' ')}
            >
              <div className="text-base font-bold text-slate-900">{card.title}</div>
              <div className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">
                {card.hint}
              </div>
            </button>
          ))}
        </div>
      </div>

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

      {activeView !== 'history' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
          <section className="rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-6 shadow-[var(--app-shadow)] lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="text-right">
                <h3 className="text-[1.55rem] font-bold text-slate-900">
                  نموذج العملية
                </h3>
                <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                  اختر القسم والصنف ثم أدخل تفاصيل الحركة قبل الحفظ.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                {formatHistoryOperationType(activeView)}
              </div>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-2">
              <label className={labelClassName()}>
                <span className="block text-sm font-semibold text-slate-700">
                  نوع العملية
                </span>
                <input
                  value={formatHistoryOperationType(activeView)}
                  readOnly
                  className="h-[46px] w-full rounded-2xl border border-[var(--app-border)] bg-slate-50 px-4 text-sm text-slate-700 outline-none"
                />
              </label>

              <label className={labelClassName()}>
                <span className="block text-sm font-semibold text-slate-700">
                  القسم
                </span>
                <select
                  value={form.categoryKey}
                  onChange={(event) => handleCategoryChange(event.target.value)}
                  className={fieldClassName(Boolean(formErrors.categoryKey))}
                >
                  {operationCategoryOptions.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                    </option>
                  ))}
                </select>
                {formErrors.categoryKey ? (
                  <p className="text-xs text-red-600">{formErrors.categoryKey}</p>
                ) : null}
              </label>

              <label className={labelClassName()}>
                <span className="block text-sm font-semibold text-slate-700">
                  اسم المشروع
                </span>
                <input
                  type="text"
                  value={form.projectName}
                  onChange={(event) => updateForm('projectName', event.target.value)}
                  className={fieldClassName(Boolean(formErrors.projectName))}
                  placeholder="اكتب اسم المشروع"
                />
                {formErrors.projectName ? (
                  <p className="text-xs text-red-600">{formErrors.projectName}</p>
                ) : null}
              </label>

              <label className={labelClassName()}>
                <span className="block text-sm font-semibold text-slate-700">
                  اسم الصنف
                </span>
                <select
                  value={form.itemId}
                  onChange={(event) => updateForm('itemId', event.target.value)}
                  className={fieldClassName(Boolean(formErrors.itemId))}
                  disabled={isItemsLoading}
                >
                  <option value="">
                    {isItemsLoading ? 'جاري تحميل الأصناف...' : 'اختر الصنف'}
                  </option>
                  {items.map((item) => {
                    const itemId = String(item.id ?? '')
                    const itemName = selectedCategory
                      ? String(item[selectedCategory.itemNameField] ?? '')
                      : ''

                    return (
                      <option key={itemId} value={itemId}>
                        {itemName || `صنف ${itemId}`}
                      </option>
                    )
                  })}
                </select>
                {formErrors.itemId ? (
                  <p className="text-xs text-red-600">{formErrors.itemId}</p>
                ) : null}
              </label>

              {activeView === 'add' ? (
                <label className={labelClassName()}>
                  <span className="block text-sm font-semibold text-slate-700">
                    كود الصنف
                  </span>
                  <input
                    type="text"
                    value={form.itemCode}
                    onChange={(event) => updateForm('itemCode', event.target.value)}
                    className={fieldClassName()}
                    placeholder="اختياري"
                  />
                </label>
              ) : null}

              <label className={labelClassName()}>
                <span className="block text-sm font-semibold text-slate-700">
                  الكمية
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.quantity}
                  onChange={(event) => updateForm('quantity', event.target.value)}
                  className={fieldClassName(Boolean(formErrors.quantity))}
                  placeholder={
                    activeView === 'adjust' ? 'أدخل الرصيد الفعلي بعد الجرد' : 'أدخل الكمية'
                  }
                />
                {formErrors.quantity ? (
                  <p className="text-xs text-red-600">{formErrors.quantity}</p>
                ) : null}
              </label>

              <label className={labelClassName()}>
                <span className="block text-sm font-semibold text-slate-700">
                  التاريخ
                </span>
                <input
                  type="date"
                  value={form.operationDate}
                  onChange={(event) => updateForm('operationDate', event.target.value)}
                  className={fieldClassName(Boolean(formErrors.operationDate))}
                />
                {formErrors.operationDate ? (
                  <p className="text-xs text-red-600">{formErrors.operationDate}</p>
                ) : null}
              </label>

              {activeView === 'add' ? (
                <label className={labelClassName()}>
                  <span className="block text-sm font-semibold text-slate-700">
                    اسم المورد
                  </span>
                  <input
                    type="text"
                    value={form.supplierName}
                    onChange={(event) => updateForm('supplierName', event.target.value)}
                    className={fieldClassName(Boolean(formErrors.supplierName))}
                    placeholder="اسم المورد"
                  />
                  {formErrors.supplierName ? (
                    <p className="text-xs text-red-600">{formErrors.supplierName}</p>
                  ) : null}
                </label>
              ) : null}

              {activeView === 'add' ? (
                <label className={labelClassName()}>
                  <span className="block text-sm font-semibold text-slate-700">
                    رقم طلب شراء / أمر توريد
                  </span>
                  <input
                    type="text"
                    value={form.purchaseOrderNumber}
                    onChange={(event) =>
                      updateForm('purchaseOrderNumber', event.target.value)
                    }
                    className={fieldClassName()}
                    placeholder="اختياري"
                  />
                </label>
              ) : null}

              {activeView === 'issue' ? (
                <label className={labelClassName()}>
                  <span className="block text-sm font-semibold text-slate-700">
                    اسم الشخص اللي تم الصرف له
                  </span>
                  <input
                    type="text"
                    value={form.issuedTo}
                    onChange={(event) => updateForm('issuedTo', event.target.value)}
                    className={fieldClassName(Boolean(formErrors.issuedTo))}
                    placeholder="اسم المستلم"
                  />
                  {formErrors.issuedTo ? (
                    <p className="text-xs text-red-600">{formErrors.issuedTo}</p>
                  ) : null}
                </label>
              ) : null}
            </div>

            <label className={`${labelClassName()} mt-5 block`}>
              <span className="block text-sm font-semibold text-slate-700">
                ملاحظات
              </span>
              <textarea
                value={form.notes}
                onChange={(event) => updateForm('notes', event.target.value)}
                className={textAreaClassName(Boolean(formErrors.notes))}
                placeholder={
                  activeView === 'adjust'
                    ? 'اكتب سبب الجرد أو سبب تعديل الرصيد'
                    : 'أي تفاصيل إضافية مطلوبة'
                }
              />
              {formErrors.notes ? (
                <p className="text-xs text-red-600">{formErrors.notes}</p>
              ) : null}
            </label>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-start">
              <button
                type="button"
                onClick={() => resetForm(activeView)}
                className="h-[46px] rounded-2xl px-6 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
              >
                إعادة تعيين
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
                className="h-[46px] min-w-[200px] rounded-2xl bg-[var(--app-primary)] px-6 text-sm font-bold text-white transition hover:bg-[var(--app-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'جاري حفظ العملية...' : 'تأكيد العملية'}
              </button>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-6 shadow-[var(--app-shadow)]">
              <div className="text-right">
                <h3 className="text-[1.35rem] font-bold text-slate-900">
                  ملخص الرصيد
                </h3>
                <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                  معاينة فورية لأثر العملية قبل الحفظ.
                </p>
              </div>

              <div className="mt-6 space-y-4">
                <div className="rounded-[24px] bg-slate-50 px-5 py-4">
                  <div className="text-sm text-slate-500">الرصيد الحالي</div>
                  <div className="mt-2 text-[1.8rem] font-bold text-slate-900">
                    {currentBalance.toLocaleString()}
                  </div>
                </div>

                <div className="rounded-[24px] bg-slate-50 px-5 py-4">
                  <div className="text-sm text-slate-500">الكمية المدخلة</div>
                  <div className="mt-2 text-[1.8rem] font-bold text-slate-900">
                    {quantityValue.toLocaleString()}
                  </div>
                </div>

                <div
                  className={[
                    'rounded-[24px] px-5 py-4',
                    activeView === 'issue'
                      ? 'bg-orange-50'
                      : activeView === 'adjust'
                        ? 'bg-blue-50'
                        : 'bg-emerald-50',
                  ].join(' ')}
                >
                  <div className="text-sm text-slate-500">الرصيد بعد العملية</div>
                  <div className="mt-2 text-[1.8rem] font-bold text-slate-900">
                    {balanceAfterOperation.toLocaleString()}
                  </div>
                </div>
                {selectedCategory?.key === 'raw_materials' && selectedItem
                  ? selectedCategory.attributeFields.map((field) => (
                      <div key={field} className="flex items-center justify-between gap-3">
                        <span>{selectedCategory.columns[field] ?? field}</span>
                        <span className="font-semibold text-slate-900">
                          {String(selectedItem[field] ?? '-')}
                        </span>
                      </div>
                    ))
                  : null}
              </div>
            </section>

            <section className="rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-6 shadow-[var(--app-shadow)]">
              <h3 className="text-[1.2rem] font-bold text-slate-900">
                حالة الاختيار
              </h3>
              <div className="mt-5 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>القسم</span>
                  <span className="font-semibold text-slate-900">
                    {selectedCategory?.label ?? '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>الصنف</span>
                  <span className="font-semibold text-slate-900">
                    {selectedItem && selectedCategory
                      ? String(selectedItem[selectedCategory.itemNameField] ?? '—')
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>الكود</span>
                  <span className="font-semibold text-slate-900">
                    {form.itemCode || '—'}
                  </span>
                </div>
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="text-right">
            <h3 className="text-[1.7rem] font-bold text-slate-900">
              سجل الحركات
            </h3>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">
              آخر الحركات المسجلة من الإضافة والصرف والجرد.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadHistory()}
            className="inline-flex h-[42px] items-center rounded-2xl border border-[var(--app-border)] bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            تحديث السجل
          </button>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
          {isHistoryLoading ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              جاري تحميل سجل الحركات...
            </div>
          ) : historyRows.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">
              لا توجد حركات مسجلة حتى الآن
            </div>
          ) : (
            <DataTable
              columns={historyColumns}
              rows={historyRows}
              getRowKey={(row) => row.id}
              stickyHeader
              maxHeightClassName="max-h-[520px] overflow-auto"
              rowClassName="hover:bg-slate-50"
            />
          )}
        </div>
      </section>
    </section>
  )
}
