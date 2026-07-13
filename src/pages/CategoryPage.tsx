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
import { EditItemModal } from '../features/item-edit/EditItemModal'
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
  getCustodyCategoryRows,
  getCustodyRecord,
  getItemDetails,
  getItemMovements,
  isCustodyTable,
  type CategorySummaryItem,
  type ItemDetails,
} from '../services/itemsService'
import { createInventoryItem } from '../services/inventoryService'
import {
  archiveLongWeldingGlove,
  createLongWeldingGlove,
  listLongWeldingGloves,
  type LongWeldingGloveRecord,
} from '../services/longWeldingGlovesService'
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

function mapGloveRows(rows: Awaited<ReturnType<typeof listLongWeldingGloves>>['data']): CategorySummaryItem[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    type_name: row.type_name,
    received_by: row.received_by,
    received_date: row.received_date,
    notes: row.notes,
    table_name: 'long_welding_gloves',
    category_name: 'جوانتي لحام طويل',
    item_id: row.id,
    item_key: null,
    project_name: null,
    item_name: row.type_name,
    stock_balance: null,
    min_quantity: null,
    status: null,
    total_added: null,
    total_issued: null,
    source_rows_count: 1,
    updated_at: null,
    created_at: null,
  }))
}

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
  const [editingItem, setEditingItem] = useState<ItemDetails | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [operationType, setOperationType] = useState<InventoryOperationType | null>(null)
  const [form, setForm] = useState<OperationFormState>(createInitialOperationFormState(null))
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const category: CategoryDefinition | null =
    categoryKey && isCategoryKey(categoryKey)
      ? (categoryConfig[categoryKey] as CategoryDefinition)
      : null

  const deferredSearchTerm = useDeferredValue(searchTerm)
  const isCustodyCategory = Boolean(category && isCustodyTable(category.table))

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

      const result = activeCategory.table === 'long_welding_gloves'
        ? await listLongWeldingGloves()
        : isCustodyTable(activeCategory.table)
        ? await getCustodyCategoryRows(activeCategory.table)
        : await getCategorySummaryItems(activeCategory.table)

      if (isCancelled) {
        return
      }

      if (result.error) {
        setRows([])
        setError(result.error)
      } else {
        setRows(activeCategory.table === 'long_welding_gloves' ? mapGloveRows(result.data as LongWeldingGloveRecord[] | null) : (result.data ?? []) as CategorySummaryItem[])
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
          row.code,
          row.type_name,
          row.received_by,
          row.received_date,
          row.scrapped_date,
          row.source_sheet,
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

    const result = category.table === 'long_welding_gloves'
      ? await listLongWeldingGloves()
      : isCustodyTable(category.table)
      ? await getCustodyCategoryRows(category.table)
      : await getCategorySummaryItems(category.table)

    if (result.error) {
      setError(result.error)
      return
    }

    setRows(category.table === 'long_welding_gloves' ? mapGloveRows(result.data as LongWeldingGloveRecord[] | null) : (result.data ?? []) as CategorySummaryItem[])
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

  async function openEditModal(row: CategorySummaryItem) {
    if (!category) return
    setIsPreparingOperation(true)
    setMessage(null)
    const result = category.table === 'long_welding_gloves'
      ? await getCustodyRecord('long_welding_gloves', String(row.item_id))
      : await getItemDetails(category.table, String(row.item_id))
    setIsPreparingOperation(false)
    if (result.error || !result.data) {
      setMessage({ type: 'error', text: result.error || 'تعذر تحميل بيانات الصنف' })
      return
    }
    setEditingItem(category.table === 'long_welding_gloves' ? {
      ...result.data,
      table_name: category.table,
      category_name: category.label,
      item_id: result.data.id,
      item_key: null,
      project_name: null,
      item_name: result.data.type_name,
      stock_balance: null,
      min_quantity: null,
      status: null,
      total_added: null,
      total_issued: null,
      source_rows_count: 1,
      updated_at: null,
      created_at: null,
    } as ItemDetails : result.data as ItemDetails)
  }

  async function handleEditSuccess(balanceChanged: boolean) {
    if (!category || !editingItem) return
    if (category.table === 'long_welding_gloves') {
      await refreshRows()
      setEditingItem(null)
      setMessage({ type: 'success', text: 'تم تعديل سجل العهدة بنجاح' })
      return
    }
    const itemId = String(editingItem.item_id)
    const [summaryResult] = await Promise.all([
      getCategorySummaryItems(category.table),
      getItemDetails(category.table, itemId),
      getItemMovements(category.table, itemId),
    ])
    if (!summaryResult.error) setRows(summaryResult.data ?? [])
    setEditingItem(null)
    setMessage({
      type: 'success',
      text: balanceChanged
        ? 'تم تعديل بيانات الصنف بنجاح — تم تعديل الرصيد وتسجيل حركة جرد / تعديل رصيد'
        : 'تم تعديل بيانات الصنف بنجاح',
    })
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

    const result = category.table === 'long_welding_gloves'
      ? await createLongWeldingGlove({
          type_name: String(preparedValues.type_name ?? ''),
          received_by: String(preparedValues.received_by ?? ''),
          received_date: String(preparedValues.received_date ?? ''),
          notes: preparedValues.notes ? String(preparedValues.notes) : null,
        })
      : await createInventoryItem(category.table, preparedValues)

    if (result.error) {
      setMessage({ type: 'error', text: result.error })
      setIsCreateSubmitting(false)
      return
    }

    await refreshRows()
    closeCreateModal()
    setMessage({
      type: 'success',
      text: category.table === 'long_welding_gloves'
        ? 'تمت إضافة سجل العهدة بنجاح'
        : 'تم إضافة الصنف وتسجيله كحركة إضافة بنجاح',
    })
    setIsCreateSubmitting(false)
  }

  async function handleArchiveGlove(row: CategorySummaryItem) {
    if (!window.confirm('هل تريد أرشفة سجل العهدة هذا؟')) return
    const result = await archiveLongWeldingGlove(String(row.item_id))
    if (result.error) {
      setMessage({ type: 'error', text: result.error })
      return
    }
    await refreshRows()
    setMessage({ type: 'success', text: 'تمت أرشفة سجل العهدة' })
  }

  const columns = useMemo<DataTableColumn<CategorySummaryItem>[]>(
    () => {
      const detailsColumn: DataTableColumn<CategorySummaryItem> = {
        id: 'actions',
        header: 'الإجراءات',
        headerClassName: 'px-4 py-3 text-slate-700',
        cellClassName: 'px-4 py-3',
        renderCell: (row) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              navigate(`/category/${categoryKey}/item/${row.item_id}`)
            }}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            التفاصيل
          </button>
        ),
      }

      if (category && isCustodyTable(category.table)) {
        const custodyColumns: DataTableColumn<CategorySummaryItem>[] = [
          ...(category.table === 'cutting_discs' ? [{
            id: 'code', header: 'الكود', renderCell: (row: CategorySummaryItem) => getDisplayValue(row.code),
          }] : []),
          { id: 'type_name', header: 'النوع', renderCell: (row) => getDisplayValue(row.type_name) },
          { id: 'received_by', header: 'المستلم', renderCell: (row) => getDisplayValue(row.received_by) },
          { id: 'received_date', header: 'تاريخ الاستلام', renderCell: (row) => getDisplayValue(row.received_date) },
          ...(category.table === 'cutting_discs' ? [{
            id: 'scrapped_date', header: 'تاريخ التكهين', renderCell: (row: CategorySummaryItem) => getDisplayValue(row.scrapped_date),
          }] : []),
          ...(category.table === 'long_welding_gloves' ? [{
            id: 'notes', header: 'ملاحظات', renderCell: (row: CategorySummaryItem) => getDisplayValue(row.notes),
          }] : [{
            id: 'source_sheet', header: 'المصدر', renderCell: (row: CategorySummaryItem) => getDisplayValue(row.source_sheet),
          }]),
          ...(category.table === 'long_welding_gloves' ? [{
            id: 'actions',
            header: 'إجراءات',
            renderCell: (row: CategorySummaryItem) => (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); void openEditModal(row) }}
                  className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                >تعديل</button>
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); void handleArchiveGlove(row) }}
                  className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                >أرشفة</button>
              </div>
            ),
          }] : [detailsColumn]),
        ]
        return custodyColumns.map((column) => ({
          headerClassName: 'px-4 py-3 text-slate-700',
          cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
          ...column,
        }))
      }

      return [
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
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void openEditModal(row)
              }}
              className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
            >
              تعديل الصنف
            </button>
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
      ]
    },
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
            {isCustodyCategory ? 'سجلات العهدة الخاصة بهذا القسم.' : 'إدارة الأصناف والحركات الخاصة بهذا القسم.'}
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
        searchPlaceholder={isCustodyCategory ? 'ابحث بالكود أو النوع أو المستلم أو المصدر' : 'ابحث باسم المشروع أو الصنف أو الحالة'}
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

      {editingItem ? (
        <EditItemModal
          category={category}
          itemId={String(editingItem.item_id)}
          itemData={editingItem}
          onClose={() => setEditingItem(null)}
          onSuccess={handleEditSuccess}
        />
      ) : null}
    </section>
  )
}
