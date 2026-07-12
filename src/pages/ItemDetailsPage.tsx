import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import {
  categoryConfig,
  type CategoryDefinition,
  type CategoryKey,
} from '../config/categoryConfig'
import { ItemMovementsDateFilter } from '../features/item-details/components/ItemMovementsDateFilter'
import { InventoryOperationModal } from '../features/inventory-operations/InventoryOperationModal'
import {
  createInitialOperationFormState,
  getDisplayText,
  getNumericValue,
  getOperationTypeLabel,
  type OperationFormState,
  validateOperationForm,
} from '../features/inventory-operations/operationForm'
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

type ItemMovementsDateFilterValue = {
  fromDate: string
  toDate: string
}

type MonthlyMovementSummary = {
  monthKey: string
  monthLabel: string
  totalAdded: number
  totalIssued: number
}

function isCategoryKey(value: string): value is CategoryKey {
  return value in categoryConfig
}

function parseInventoryDate(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) {
    return null
  }

  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function getDateTimestamp(value: string) {
  const date = parseInventoryDate(value)
  return date ? date.getTime() : null
}

function getInclusiveDateEndTimestamp(value: string) {
  const date = parseInventoryDate(value)

  if (!date) {
    return null
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  ).getTime()
}

function formatMovementDate(value: string | null | undefined) {
  const date = parseInventoryDate(value)

  if (!date) {
    return getDisplayText(value)
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  return `${day}/${month}/${year}`
}

function formatArabicMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('ar-EG', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function buildMonthlyMovementSummaries(movements: ItemMovement[]): MonthlyMovementSummary[] {
  const summariesMap = new Map<string, MonthlyMovementSummary>()

  movements.forEach((movement) => {
    const date = parseInventoryDate(movement.operation_date)

    if (!date) {
      return
    }

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const currentSummary = summariesMap.get(monthKey) ?? {
      monthKey,
      monthLabel: formatArabicMonthLabel(date),
      totalAdded: 0,
      totalIssued: 0,
    }

    currentSummary.totalAdded += getNumericValue(movement.added_quantity)
    currentSummary.totalIssued += getNumericValue(movement.issued_quantity)

    summariesMap.set(monthKey, currentSummary)
  })

  return Array.from(summariesMap.values()).sort((firstSummary, secondSummary) =>
    secondSummary.monthKey.localeCompare(firstSummary.monthKey),
  )
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
  const [form, setForm] = useState<OperationFormState>(createInitialOperationFormState(null))
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [movementDateFilter, setMovementDateFilter] =
    useState<ItemMovementsDateFilterValue>({ fromDate: '', toDate: '' })

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
        renderCell: (row) => formatMovementDate(row.operation_date),
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

  const monthlyMovementSummaries = useMemo(
    () => buildMonthlyMovementSummaries(movements),
    [movements],
  )

  const filteredMovements = useMemo(() => {
    const fromTimestamp = movementDateFilter.fromDate
      ? getDateTimestamp(movementDateFilter.fromDate)
      : null
    const toTimestamp = movementDateFilter.toDate
      ? getInclusiveDateEndTimestamp(movementDateFilter.toDate)
      : null

    return movements.filter((movement) => {
      if (fromTimestamp === null && toTimestamp === null) {
        return true
      }

      const movementTimestamp = movement.operation_date
        ? getDateTimestamp(movement.operation_date)
        : null

      if (movementTimestamp === null) {
        return false
      }

      if (fromTimestamp !== null && movementTimestamp < fromTimestamp) {
        return false
      }

      if (toTimestamp !== null && movementTimestamp > toTimestamp) {
        return false
      }

      return true
    })
  }, [movementDateFilter.fromDate, movementDateFilter.toDate, movements])

  const filteredMovementTotals = useMemo(() => {
    return filteredMovements.reduce(
      (totals, movement) => ({
        totalAdded: totals.totalAdded + getNumericValue(movement.added_quantity),
        totalIssued: totals.totalIssued + getNumericValue(movement.issued_quantity),
      }),
      { totalAdded: 0, totalIssued: 0 },
    )
  }, [filteredMovements])

  const hasMovementDateFilter = Boolean(
    movementDateFilter.fromDate || movementDateFilter.toDate,
  )

  function openOperationModal(nextOperationType: InventoryOperationType) {
    setOperationType(nextOperationType)
    setForm(createInitialOperationFormState(details))
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

  function validateCurrentOperationForm() {
    const validationResult = validateOperationForm({
      details,
      form,
      operationType,
    })

    setFormErrors(validationResult.errors)
    return validationResult.isValid
  }

  async function handleOperationSubmit() {
    if (!category || !itemId || !details || !operationType) {
      return
    }

    setMessage(null)

    if (!validateCurrentOperationForm()) {
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

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
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
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {monthlyMovementSummaries.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[var(--app-border)] px-5 py-6 text-sm text-slate-500 md:col-span-2 xl:col-span-3">
                  لا توجد حركات شهرية مسجلة لهذا الصنف.
                </div>
              ) : (
                monthlyMovementSummaries.flatMap((summary) => [
                  <SummaryCard
                    key={`${summary.monthKey}-added`}
                    label={`إجمالي الإضافة (${summary.monthLabel})`}
                    value={summary.totalAdded.toLocaleString()}
                    toneClassName="bg-emerald-50 text-slate-900"
                  />,
                  <SummaryCard
                    key={`${summary.monthKey}-issued`}
                    label={`إجمالي الصرف (${summary.monthLabel})`}
                    value={summary.totalIssued.toLocaleString()}
                    toneClassName="bg-orange-50 text-slate-900"
                  />,
                ])
              )}
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

            <ItemMovementsDateFilter
              fromDate={movementDateFilter.fromDate}
              toDate={movementDateFilter.toDate}
              onFromDateChange={(fromDate) =>
                setMovementDateFilter((currentValue) => ({ ...currentValue, fromDate }))
              }
              onToDateChange={(toDate) =>
                setMovementDateFilter((currentValue) => ({ ...currentValue, toDate }))
              }
              onClear={() => setMovementDateFilter({ fromDate: '', toDate: '' })}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <SummaryCard
                label={
                  hasMovementDateFilter
                    ? 'إجمالي الإضافة للفترة المحددة'
                    : 'إجمالي الإضافة لكل الحركات'
                }
                value={filteredMovementTotals.totalAdded.toLocaleString()}
                toneClassName="bg-emerald-50 text-slate-900"
              />
              <SummaryCard
                label={
                  hasMovementDateFilter
                    ? 'إجمالي الصرف للفترة المحددة'
                    : 'إجمالي الصرف لكل الحركات'
                }
                value={filteredMovementTotals.totalIssued.toLocaleString()}
                toneClassName="bg-orange-50 text-slate-900"
              />
            </div>

            <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
              {filteredMovements.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-slate-500">
                  {hasMovementDateFilter
                    ? 'لا توجد حركات ضمن الفترة المحددة'
                    : 'لا توجد حركات مسجلة لهذا الصنف حتى الآن'}
                </div>
              ) : (
                <DataTable
                  columns={movementColumns}
                  rows={filteredMovements}
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
        <InventoryOperationModal
          category={category}
          itemId={itemId}
          itemData={details as Record<string, unknown> & ItemDetails}
          operationType={operationType}
          form={form}
          formErrors={formErrors}
          isSubmitting={isSubmitting}
          onClose={closeOperationModal}
          onFieldChange={updateFormField}
          onSubmit={handleOperationSubmit}
        />
      ) : null}
    </section>
  )
}
