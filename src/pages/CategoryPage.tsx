import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DataFilters } from '../components/DataFilters'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { TablePagination } from '../components/TablePagination'
import {
  categoryConfig,
  type CategoryDefinition,
  type CategoryKey,
} from '../config/categoryConfig'
import { ItemCreateModal } from '../features/item-creation/ItemCreateModal'
import { ItemSelectionModal } from '../features/item-creation/ItemSelectionModal'
import {
  createInitialItemCreateFormState,
  type ItemCreateFormState,
  validateItemCreateForm,
} from '../features/item-creation/itemCreateForm'
import { InventoryOperationModal } from '../features/inventory-operations/InventoryOperationModal'
import {
  createInitialOperationFormState,
  type OperationFormState,
  validateOperationForm,
} from '../features/inventory-operations/operationForm'
import { usePagination } from '../hooks/usePagination'
import {
  getCategorySummaryItems,
  getItemDetails,
  type CategorySummaryItem,
  type ItemDetails,
} from '../services/itemsService'
import { createInventoryItem } from '../services/inventoryService'
import {
  applyInventoryOperation,
  type InventoryOperationType,
} from '../services/operationsService'
import { getStockStatusClass } from '../utils/statusUtils'

type MessageState = {
  type: 'success' | 'error'
  text: string
} | null

type CategoryQuickAction = 'add' | 'issue' | null

function isCategoryKey(value: string): value is CategoryKey {
  return value in categoryConfig
}

function getDisplayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  return String(value)
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

export function CategoryPage() {
  const { categoryKey } = useParams()
  const navigate = useNavigate()
  const [rows, setRows] = useState<CategorySummaryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPreparingOperation, setIsPreparingOperation] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<MessageState>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [quickAction, setQuickAction] = useState<CategoryQuickAction>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState<ItemCreateFormState>({})
  const [createFormErrors, setCreateFormErrors] = useState<Record<string, string>>({})
  const [selectedItemDetails, setSelectedItemDetails] = useState<ItemDetails | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [operationType, setOperationType] = useState<InventoryOperationType | null>(null)
  const [form, setForm] = useState<OperationFormState>(createInitialOperationFormState(null))
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const category: CategoryDefinition | null =
    categoryKey && isCategoryKey(categoryKey)
      ? (categoryConfig[categoryKey] as CategoryDefinition)
      : null

  const deferredSearchTerm = useDeferredValue(searchTerm)

  useEffect(() => {
    if (!category) {
      setCreateForm({})
      setCreateFormErrors({})
      return
    }

    setCreateForm(createInitialItemCreateFormState(category))
    setCreateFormErrors({})
  }, [category])

  useEffect(() => {
    if (!category) {
      setRows([])
      setError(null)
      setIsLoading(false)
      return
    }

    let isCancelled = false
    const activeCategory = category

    async function loadRows() {
      setIsLoading(true)
      setError(null)

      const result = await getCategorySummaryItems(activeCategory.table)

      if (isCancelled) {
        return
      }

      if (result.error) {
        setRows([])
        setError(result.error)
      } else {
        setRows(result.data ?? [])
      }

      setIsLoading(false)
    }

    void loadRows()

    return () => {
      isCancelled = true
    }
  }, [category])

  const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase()
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (!normalizedSearchTerm) {
          return true
        }

        return [
          row.project_name,
          row.item_name,
          row.status,
          row.material_source,
          row.weight,
          row.length,
          row.width,
          row.th,
        ]
          .map((value) => String(value ?? '').toLowerCase())
          .some((value) => value.includes(normalizedSearchTerm))
      }),
    [normalizedSearchTerm, rows],
  )

  const pagination = usePagination(filteredRows, { initialPageSize: 10 })

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

  function openCreateModal() {
    if (!category) {
      return
    }

    setCreateForm(createInitialItemCreateFormState(category))
    setCreateFormErrors({})
    setIsCreateModalOpen(true)
    setQuickAction(null)
    setMessage(null)
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false)
    setCreateFormErrors({})
  }

  function updateCreateFormField(field: string, value: string) {
    setCreateForm((currentForm) => ({ ...currentForm, [field]: value }))
    setCreateFormErrors((currentErrors) => {
      if (!(field in currentErrors)) {
        return currentErrors
      }

      const nextErrors = { ...currentErrors }
      delete nextErrors[field]
      return nextErrors
    })
  }

  function closeOperationModal() {
    setOperationType(null)
    setSelectedItemDetails(null)
    setSelectedItemId(null)
    setFormErrors({})
  }

  function openQuickAction(nextAction: Exclude<CategoryQuickAction, null>) {
    setQuickAction(nextAction)
    setMessage(null)
  }

  function closeQuickActionModal() {
    setQuickAction(null)
  }

  async function refreshRows() {
    if (!category) {
      return
    }

    const result = await getCategorySummaryItems(category.table)

    if (result.error) {
      setError(result.error)
      return
    }

    setRows(result.data ?? [])
  }

  async function openOperationModal(
    row: CategorySummaryItem,
    nextOperationType: InventoryOperationType,
  ) {
    if (!category) {
      return
    }

    setQuickAction(null)
    setIsPreparingOperation(true)
    setMessage(null)

    const result = await getItemDetails(category.table, String(row.item_id))
    setIsPreparingOperation(false)

    if (result.error || !result.data) {
      setMessage({
        type: 'error',
        text: result.error || 'تعذر تحميل بيانات الصنف',
      })
      return
    }

    setSelectedItemDetails(result.data)
    setSelectedItemId(String(row.item_id))
    setOperationType(nextOperationType)
    setForm(createInitialOperationFormState(result.data))
    setFormErrors({})
  }

  async function handleOperationSubmit() {
    if (!category || !selectedItemId || !selectedItemDetails || !operationType) {
      return
    }

    setMessage(null)

    const validationResult = validateOperationForm({
      details: selectedItemDetails,
      form,
      operationType,
    })

    if (!validationResult.isValid) {
      setFormErrors(validationResult.errors)
      return
    }

    setIsSubmitting(true)

    try {
      await applyInventoryOperation({
        tableName: category.table,
        categoryName: selectedItemDetails.category_name || category.label,
        itemId: selectedItemId,
        itemName: selectedItemDetails.item_name || `صنف ${selectedItemId}`,
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

      await refreshRows()
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
    } catch (submitError) {
      setMessage({
        type: 'error',
        text: submitError instanceof Error ? submitError.message : 'تعذر تنفيذ العملية',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCreateSubmit() {
    if (!category) {
      return
    }

    const validationResult = validateItemCreateForm(category, createForm)

    if (!validationResult.isValid) {
      setCreateFormErrors(validationResult.errors)
      return
    }

    setIsCreateSubmitting(true)
    setMessage(null)

    const preparedValues = Object.entries(createForm).reduce<Record<string, string | number | null>>(
      (result, [fieldKey, value]) => {
        const matchingField = category.createFields?.find(
          (field) => String(field.key) === fieldKey,
        )
        const trimmedValue = value.trim()

        if (!trimmedValue) {
          return result
        }

        result[fieldKey] =
          matchingField?.inputType === 'number' ? Number(trimmedValue) : trimmedValue
        return result
      },
      {},
    )

    if (category.table === 'paints') {
      preparedValues.expire_date = createForm.expire_date?.trim() || null
    }

    const result = await createInventoryItem(category.table, preparedValues)

    if (result.error) {
      setMessage({ type: 'error', text: result.error })
      setIsCreateSubmitting(false)
      return
    }

    await refreshRows()
    closeCreateModal()
    setMessage({ type: 'success', text: 'تمت إضافة الصنف بنجاح' })
    setIsCreateSubmitting(false)
  }

  const columns = useMemo<DataTableColumn<CategorySummaryItem>[]>(
    () => [
      {
        id: 'project_name',
        header: 'مشروع',
        headerClassName: 'px-4 py-3 text-slate-700',
        cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
        renderCell: (row) => getDisplayValue(row.project_name),
      },
      {
        id: 'item_name',
        header: 'صنف',
        headerClassName: 'px-4 py-3 text-slate-700',
        cellClassName: 'px-4 py-3 font-semibold text-slate-800',
        renderCell: (row) => getDisplayValue(row.item_name),
      },
      {
        id: 'stock_balance',
        header: 'رصيد مخزني',
        headerClassName: 'px-4 py-3 text-slate-700',
        cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
        renderCell: (row) => getDisplayValue(row.stock_balance),
      },
      {
        id: 'min_quantity',
        header: 'الحد الأدنى',
        headerClassName: 'px-4 py-3 text-slate-700',
        cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
        renderCell: (row) => getDisplayValue(row.min_quantity),
      },
      {
        id: 'status',
        header: 'الحالة',
        headerClassName: 'px-4 py-3 text-slate-700',
        cellClassName: 'align-top px-4 py-3',
        renderCell: (row) => (
          <span
            className={[
              'inline-flex rounded-full px-3 py-1 text-xs font-medium',
              getStatusBadgeClass(row.status),
            ].join(' ')}
          >
            {row.status || 'غير محدد'}
          </span>
        ),
      },
      ...(category?.table === 'raw_materials'
        ? [
            {
              id: 'weight',
              header: 'وزن',
              headerClassName: 'px-4 py-3 text-slate-700',
              cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
              renderCell: (row: CategorySummaryItem) => getDisplayValue(row.weight),
            },
            {
              id: 'length',
              header: 'LENGTH',
              headerClassName: 'px-4 py-3 text-slate-700',
              cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
              renderCell: (row: CategorySummaryItem) => getDisplayValue(row.length),
            },
            {
              id: 'width',
              header: 'WIDTH',
              headerClassName: 'px-4 py-3 text-slate-700',
              cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
              renderCell: (row: CategorySummaryItem) => getDisplayValue(row.width),
            },
            {
              id: 'th',
              header: 'TH',
              headerClassName: 'px-4 py-3 text-slate-700',
              cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
              renderCell: (row: CategorySummaryItem) => getDisplayValue(row.th),
            },
          ]
        : []),
      ...(category?.table === 'paints'
        ? [
            {
              id: 'expire_date',
              header: 'تاريخ الانتهاء',
              headerClassName: 'px-4 py-3 text-slate-700',
              cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
              renderCell: (row: CategorySummaryItem) =>
                getDisplayValue(row.expire_date),
            },
          ]
        : []),
      {
        id: 'actions',
        header: 'الإجراءات',
        headerClassName: 'px-4 py-3 text-slate-700',
        cellClassName: 'px-4 py-3',
        renderCell: (row) => (
          <div className="flex flex-wrap justify-end gap-2">
            {category?.operationsEnabled ? (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    void openOperationModal(row, 'issue')
                  }}
                  className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
                >
                  صرف
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    void openOperationModal(row, 'add')
                  }}
                  className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  إضافة
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    void openOperationModal(row, 'adjust')
                  }}
                  className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  جرد
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                navigate(`/category/${categoryKey}/item/${row.item_id}`, {
                  state: {
                    tableName: row.table_name,
                    categoryName: row.category_name,
                  },
                })
              }}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              التفاصيل
            </button>
          </div>
        ),
      },
    ],
    [category, categoryKey, navigate],
  )

  if (!category) {
    return (
      <section>
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-8 shadow-[var(--app-shadow)]">
          <h1 className="text-2xl font-semibold text-slate-900">تصنيف غير موجود</h1>
        </div>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-right">
          <h2 className="text-xl font-bold text-slate-900">{category.label}</h2>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">
            إدارة الأصناف والحركات الخاصة بهذا القسم.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {category.operationsEnabled ? (
            <>
              <button
                type="button"
                onClick={() => openQuickAction('add')}
                className="inline-flex h-[44px] items-center rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                إضافة
              </button>
              <button
                type="button"
                onClick={() => openQuickAction('issue')}
                className="inline-flex h-[44px] items-center rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                صرف
              </button>
            </>
          ) : null}

          {category.createFields?.length ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-[44px] items-center rounded-2xl border border-[var(--app-border)] bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              إضافة صنف جديد
            </button>
          ) : null}
        </div>
      </div>

      <DataFilters
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="ابحث باسم المشروع أو الصنف أو الحالة"
      />

      {isLoading ? (
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-10 text-center text-sm text-slate-500 shadow-[var(--app-shadow)]">
          جاري تحميل البيانات...
        </div>
      ) : null}

      {isPreparingOperation ? (
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-6 text-center text-sm text-slate-500 shadow-[var(--app-shadow)]">
          جاري تجهيز بيانات الصنف...
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-600">
          حدث خطأ أثناء تحميل البيانات: {error}
        </div>
      ) : null}

      {!isLoading && !error && filteredRows.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-10 text-center text-sm text-slate-500 shadow-[var(--app-shadow)]">
          لا توجد بيانات لعرضها
        </div>
      ) : null}

      {!isLoading && !error && filteredRows.length > 0 ? (
        <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
          <DataTable
            columns={columns}
            rows={pagination.paginatedItems}
            getRowKey={(row) => `${category.table}-${row.item_id}`}
            stickyHeader
            maxHeightClassName="max-h-[70vh] overflow-auto"
            tableClassName="divide-y divide-slate-200"
            rowClassName="hover:bg-slate-50"
            onRowClick={(row) => {
              navigate(`/category/${categoryKey}/item/${row.item_id}`, {
                state: {
                  tableName: row.table_name,
                  categoryName: row.category_name,
                },
              })
            }}
          />
          <TablePagination
            currentPage={pagination.currentPage}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
            pageStart={pagination.pageStart}
            pageEnd={pagination.pageEnd}
            onPageChange={pagination.setCurrentPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </div>
      ) : null}

      {selectedItemDetails && selectedItemId ? (
        <InventoryOperationModal
          category={category}
          itemId={selectedItemId}
          itemData={selectedItemDetails as Record<string, unknown> & ItemDetails}
          operationType={operationType}
          form={form}
          formErrors={formErrors}
          isSubmitting={isSubmitting}
          onClose={closeOperationModal}
          onFieldChange={updateFormField}
          onSubmit={handleOperationSubmit}
        />
      ) : null}

      {quickAction ? (
        <ItemSelectionModal
          items={rows}
          title={quickAction === 'add' ? 'إضافة على صنف موجود' : 'صرف من صنف موجود'}
          description={
            quickAction === 'add'
              ? 'اختر صنفاً موجوداً لإضافة كمية عليه، أو أضف صنفاً جديداً.'
              : 'اختر الصنف الذي تريد تنفيذ الصرف عليه.'
          }
          emptyMessage={
            quickAction === 'add'
              ? 'لا توجد أصناف حالياً. يمكنك إضافة صنف جديد أولاً.'
              : 'لا توجد أصناف متاحة للصرف في هذا القسم.'
          }
          confirmLabel={quickAction === 'add' ? 'إضافة' : 'صرف'}
          createLabel={
            quickAction === 'add' && category.createFields?.length ? 'صنف جديد' : undefined
          }
          onClose={closeQuickActionModal}
          onCreateNew={
            quickAction === 'add' && category.createFields?.length
              ? openCreateModal
              : undefined
          }
          onSelectItem={(item) =>
            void openOperationModal(item, quickAction === 'add' ? 'add' : 'issue')
          }
        />
      ) : null}

      {isCreateModalOpen ? (
        <ItemCreateModal
          category={category}
          form={createForm}
          formErrors={createFormErrors}
          isSubmitting={isCreateSubmitting}
          onClose={closeCreateModal}
          onFieldChange={updateCreateFormField}
          onSubmit={handleCreateSubmit}
        />
      ) : null}
    </section>
  )
}
