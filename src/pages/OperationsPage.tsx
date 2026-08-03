import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  categoryConfig,
  categoryEntries,
  type CategoryDefinition,
  type CategoryKey,
} from '../config/categoryConfig'
import { SearchInput } from '../components/SearchInput'
import { TablePagination } from '../components/TablePagination'
import { ToastOnChange } from '../components/ToastProvider'
import { ItemSelectionModal } from '../features/item-creation/ItemSelectionModal'
import { ItemCreateModal } from '../features/item-creation/ItemCreateModal'
import { InventoryOperationModal } from '../features/inventory-operations/InventoryOperationModal'
import { useCategoryCreate } from '../features/category/hooks/useCategoryCreate'
import { useCategoryOperation } from '../features/category/hooks/useCategoryOperation'
import type { CategoryMessage } from '../features/category/types'
import type { DashboardInventoryRow } from '../features/dashboard/types'
import { useDashboardData } from '../features/dashboard/hooks/useDashboardData'
import {
  OperationsCategoryModal,
  OperationsChoiceModal,
} from '../features/operations/OperationsActionFlow'
import { OperationsMatrixTable } from '../features/operations/OperationsMatrixTable'
import {
  buildMovementTotals,
  getMonthValue,
  getOperationsDisplayDates,
  type MatrixOperationType,
} from '../features/operations/operationsMatrix'
import { useSearchParamsPagination } from '../hooks/useSearchParamsPagination'
import { getItemDetailsRoute } from '../features/items/itemRoutes'
import { prefetchInventoryItem } from '../features/inventory/inventoryCache'
import {
  getSupabaseConfigError,
  isSupabaseConfigured,
} from '../lib/supabaseClient'
import {
  getInventoryOperationsForDateRange,
  type InventoryOperationsGridMovement,
} from '../services/operationsService'
import type { CategorySummaryItem, ItemDetails } from '../services/itemsService'
import { getLocalDateString } from '../utils/dateUtils'
import { includesSearchTerm, normalizeSearchTerm } from '../utils/searchUtils'

type ActionFlow = null | 'add-choice' | 'add-existing' | 'issue-existing' | 'new-category'

type PendingOperation = {
  requestId: number
  categoryKey: CategoryKey
  item: CategorySummaryItem
  type: MatrixOperationType
  date: string
}

type PendingCreate = {
  requestId: number
  categoryKey: CategoryKey
}

const matrixQueryKey = ['operations-matrix'] as const
const emptyMovements: InventoryOperationsGridMovement[] = []

function toSummaryItem(row: DashboardInventoryRow): CategorySummaryItem {
  const category = categoryConfig[row.categoryKey]
  return {
    table_name: category.table,
    category_name: category.label,
    item_id: row.itemId,
    item_key: null,
    internal_code: row.internalCode,
    project_name: row.projectName,
    project: row.projectName,
    item_name: row.itemName,
    type_name: row.typeName,
    stock_balance: row.stockBalance,
    min_quantity: row.minQuantity,
    status: row.status,
    total_added: row.addedQuantity,
    total_issued: row.issuedQuantity,
    source_rows_count: 1,
    updated_at: row.updatedAt,
    created_at: null,
  }
}

function getCategoryKeyByTable(tableName: string) {
  return categoryEntries.find(([, category]) => category.table === tableName)?.[0] ?? null
}

function SummaryCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string
  value: string
  helper: string
  tone: 'blue' | 'amber' | 'slate'
}) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  }

  return (
    <div className="rounded-[22px] border border-[var(--app-border)] bg-white p-4 shadow-[var(--app-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <strong dir="ltr" className="mt-2 block text-2xl font-bold text-slate-900">{value}</strong>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
        <span className={['flex h-9 min-w-9 items-center justify-center rounded-xl px-2 text-xs font-bold', toneClasses[tone]].join(' ')}>
          {tone === 'blue' ? '+' : tone === 'amber' ? '−' : '↔'}
        </span>
      </div>
    </div>
  )
}

function ActionButton({
  type,
  onClick,
}: {
  type: MatrixOperationType
  onClick: () => void
}) {
  const isAddition = type === 'add'
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold shadow-sm transition hover:-translate-y-0.5',
        isAddition
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50',
      ].join(' ')}
    >
      <span className="text-lg leading-none" aria-hidden="true">{isAddition ? '+' : '−'}</span>
      {isAddition ? 'إضافة' : 'صرف'}
    </button>
  )
}

export function OperationsPage() {
  const todayValue = getLocalDateString()
  const currentMonth = getMonthValue(todayValue)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const dashboard = useDashboardData()
  const selectedMonth = searchParams.get('month') ?? currentMonth
  const showAllRows = searchParams.get('showAll') === '1'
  const searchTerm = searchParams.get('search') ?? ''
  const categoryFilter = searchParams.get('category') ?? ''
  const [actionFlow, setActionFlow] = useState<ActionFlow>(null)
  const [activeCategoryKey, setActiveCategoryKey] = useState<CategoryKey | null>(null)
  const [message, setMessage] = useState<CategoryMessage>(null)
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null)
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null)
  const requestSequence = useRef(0)
  const handledOperationRequest = useRef<number | null>(null)
  const handledCreateRequest = useRef<number | null>(null)

  const activeCategory: CategoryDefinition | null = activeCategoryKey
    ? categoryConfig[activeCategoryKey]
    : null
  const operation = useCategoryOperation({ category: activeCategory, setMessage })
  const creation = useCategoryCreate({
    category: activeCategory,
    setMessage,
    closeQuickAction: () => setActionFlow(null),
  })
  const { open: openOperation } = operation
  const { open: openCreate } = creation

  const dates = useMemo(
    () => getOperationsDisplayDates(selectedMonth),
    [selectedMonth],
  )
  const rangeLabel = 'الشهر بالكامل'
  const rangeStart = dates[0] ?? todayValue
  const rangeEnd = dates.at(-1) ?? todayValue
  const movementsQuery = useQuery({
    queryKey: [...matrixQueryKey, rangeStart, rangeEnd],
    queryFn: () => getInventoryOperationsForDateRange(rangeStart, rangeEnd),
    enabled: isSupabaseConfigured && dates.length > 0,
  })
  const movements = movementsQuery.data ?? emptyMovements
  const movementTotals = useMemo(() => buildMovementTotals(movements), [movements])

  const operationRows = useMemo(
    () => dashboard.data.inventoryRows.filter((row) =>
      Boolean(categoryConfig[row.categoryKey].operationsEnabled),
    ),
    [dashboard.data.inventoryRows],
  )
  const normalizedSearch = normalizeSearchTerm(searchTerm)
  const filteredRows = useMemo(
    () => operationRows.filter((row) =>
      (!categoryFilter || row.categoryKey === categoryFilter) &&
      includesSearchTerm(row.searchText, normalizedSearch),
    ),
    [categoryFilter, normalizedSearch, operationRows],
  )
  const pagination = useSearchParamsPagination(filteredRows, { initialPageSize: 20 })
  const itemOptions = useMemo(
    () => operationRows.map(toSummaryItem),
    [operationRows],
  )

  const filteredMovementSummary = useMemo(() => {
    const itemKeys = new Set(
      filteredRows.map((row) =>
        `${categoryConfig[row.categoryKey].table}:${row.itemId}`,
      ),
    )

    return movements.reduce(
      (summary, movement: InventoryOperationsGridMovement) => {
        if (!itemKeys.has(`${movement.tableName}:${movement.itemId}`)) return summary
        if (movement.operationType === 'add') {
          summary.added += movement.quantity
        } else if (movement.operationType === 'issue') {
          summary.issued += movement.quantity
        }
        summary.count += 1
        return summary
      },
      { added: 0, issued: 0, count: 0 },
    )
  }, [filteredRows, movements])

  useEffect(() => {
    if (
      !pendingOperation ||
      pendingOperation.categoryKey !== activeCategoryKey ||
      handledOperationRequest.current === pendingOperation.requestId
    ) {
      return
    }

    handledOperationRequest.current = pendingOperation.requestId
    void openOperation(
      pendingOperation.item,
      pendingOperation.type,
      pendingOperation.date,
    )
  }, [activeCategoryKey, openOperation, pendingOperation])

  useEffect(() => {
    if (
      !pendingCreate ||
      pendingCreate.categoryKey !== activeCategoryKey ||
      handledCreateRequest.current === pendingCreate.requestId
    ) {
      return
    }

    handledCreateRequest.current = pendingCreate.requestId
    openCreate()
  }, [activeCategoryKey, openCreate, pendingCreate])

  useEffect(() => {
    if (message?.type !== 'success') return
    void queryClient.invalidateQueries({ queryKey: matrixQueryKey })
  }, [message, queryClient])

  function beginOperation(
    item: CategorySummaryItem,
    type: MatrixOperationType,
    date = todayValue,
  ) {
    const categoryKey = getCategoryKeyByTable(item.table_name)
    if (!categoryKey) {
      setMessage({ type: 'error', text: 'تعذر تحديد نوع المخزن لهذا الصنف.' })
      return
    }

    const requestId = ++requestSequence.current
    setMessage(null)
    setActionFlow(null)
    setActiveCategoryKey(categoryKey)
    setPendingOperation({ requestId, categoryKey, item, type, date })
  }

  function beginCreate(categoryKey: CategoryKey) {
    const requestId = ++requestSequence.current
    setMessage(null)
    setActionFlow(null)
    setActiveCategoryKey(categoryKey)
    setPendingCreate({ requestId, categoryKey })
  }

  function updateFilter(
    name: 'search' | 'category' | 'month' | 'showAll',
    value: string,
  ) {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams)
      const isDefaultValue =
        value === '' ||
        (name === 'month' && value === currentMonth) ||
        (name === 'showAll' && value !== '1')

      nextParams.delete('page')
      if (isDefaultValue) nextParams.delete(name)
      else nextParams.set(name, value)
      return nextParams
    }, { replace: true })
  }

  const configError = !isSupabaseConfigured ? getSupabaseConfigError() : null
  const queryError = dashboard.error || (
    movementsQuery.error instanceof Error ? movementsQuery.error.message : null
  )
  const isLoading = dashboard.isLoading || movementsQuery.isFetching

  return (
    <section dir="rtl" className="space-y-5">
      <ToastOnChange message={message?.text ?? null} type={message?.type} />

      <div className="rounded-[26px] border border-[var(--app-border)] bg-white p-5 shadow-[var(--app-shadow)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">شاشة العمل اليومية</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">حركات الصرف والإضافة</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              اختر الشهر، ثم اضغط على أي خلية لتنفيذ الحركة على الصنف والتاريخ المحددين.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <ActionButton type="issue" onClick={() => {
              setMessage(null)
              setActionFlow('issue-existing')
            }} />
            <ActionButton type="add" onClick={() => {
              setMessage(null)
              setActionFlow('add-choice')
            }} />
          </div>
        </div>
      </div>

      {configError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {configError}
        </div>
      ) : null}
      {queryError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {queryError}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="إجمالي الإضافة"
          value={new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(filteredMovementSummary.added)}
          helper={`خلال ${rangeLabel}`}
          tone="blue"
        />
        <SummaryCard
          label="إجمالي الصرف"
          value={new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(filteredMovementSummary.issued)}
          helper={`خلال ${rangeLabel}`}
          tone="amber"
        />
        <SummaryCard
          label="عدد الحركات"
          value={filteredMovementSummary.count.toLocaleString('en-US')}
          helper={`${filteredRows.length.toLocaleString('en-US')} صنف مطابق للتصفية`}
          tone="slate"
        />
      </div>

      <div className="overflow-hidden rounded-[26px] border border-[var(--app-border)] bg-white shadow-[var(--app-shadow)]">
        <div className="border-b border-[var(--app-border)] p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_190px_190px_auto] lg:items-end">
            <label className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-600">بحث سريع</span>
              <SearchInput
                value={searchTerm}
                onValueChange={(value) => updateFilter('search', value)}
                placeholder="ابحث باسم الصنف أو الكود أو القسم..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-600">نوع المخزن</span>
              <select
                value={categoryFilter}
                onChange={(event) => updateFilter('category', event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="">كل الأنواع</option>
                {categoryEntries
                  .filter(([, category]) => category.operationsEnabled)
                  .map(([key, category]) => (
                    <option key={key} value={key}>{category.label}</option>
                  ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-600">الشهر</span>
              <input
                type="month"
                value={selectedMonth}
                max={currentMonth}
                onChange={(event) => updateFilter('month', event.target.value || currentMonth)}
                dir="ltr"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500"
              />
            </label>

            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-600">عرض الصفوف</span>
              <label className="flex h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 transition hover:border-blue-300 hover:bg-blue-50/50">
                <input
                  type="checkbox"
                  checked={showAllRows}
                  onChange={(event) => updateFilter('showAll', event.target.checked ? '1' : '')}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
                <span className="text-sm font-bold text-slate-700">عرض الكل في صفحة واحدة</span>
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-slate-500">
              <span className="font-bold text-slate-700">طريقة الاستخدام:</span>{' '}
              اضغط أي خلية لإضافة حركة جديدة. الرقم الظاهر هو إجمالي كل حركات ذلك اليوم.
            </p>
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-amber-100" /> صرف</span>
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-blue-100" /> إضافة</span>
            </div>
          </div>
        </div>

        <OperationsMatrixTable
          rows={showAllRows ? filteredRows : pagination.paginatedItems}
          dates={dates}
          movementTotals={movementTotals}
          isLoading={isLoading}
          virtualizeRows={showAllRows}
          virtualizationResetKey={`${searchTerm}:${categoryFilter}`}
          onItemClick={(row) => {
            navigate(
              getItemDetailsRoute(row.categoryKey, row.itemId, 'operations'),
              {
                state: {
                  operationsReturnTo: `${location.pathname}${location.search}`,
                },
              },
            )
          }}
          onItemPrefetch={(row) => {
            void prefetchInventoryItem(
              queryClient,
              categoryConfig[row.categoryKey].table,
              row.itemId,
            )
          }}
          onOperation={(row, type, date) => beginOperation(toSummaryItem(row), type, date)}
        />

        {!showAllRows ? (
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
        ) : filteredRows.length > 0 ? (
          <div className="border-t border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-xs font-semibold text-slate-600 sm:px-6">
            يتم عرض {filteredRows.length.toLocaleString('en-US')} صنف بالتحميل التلقائي أثناء التمرير.
          </div>
        ) : null}
      </div>

      {operation.isPreparing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-bold text-slate-700 shadow-xl">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
            جارٍ تجهيز بيانات الصنف...
          </div>
        </div>
      ) : null}

      {actionFlow === 'add-choice' ? (
        <OperationsChoiceModal
          onClose={() => setActionFlow(null)}
          onExistingItem={() => setActionFlow('add-existing')}
          onNewItem={() => setActionFlow('new-category')}
        />
      ) : null}

      {actionFlow === 'new-category' ? (
        <OperationsCategoryModal
          onClose={() => setActionFlow(null)}
          onSelect={beginCreate}
        />
      ) : null}

      {actionFlow === 'add-existing' || actionFlow === 'issue-existing' ? (
        <ItemSelectionModal
          items={itemOptions}
          title={actionFlow === 'add-existing' ? 'إضافة على صنف موجود' : 'صرف من صنف موجود'}
          description={actionFlow === 'add-existing'
            ? 'ابحث باسم الصنف أو الكود، ثم اختره لإدخال الكمية والمورد.'
            : 'ابحث عن الصنف الذي تريد الصرف منه، ثم أدخل الكمية والمستلم.'}
          emptyMessage="لا توجد أصناف متاحة حالياً."
          confirmLabel={actionFlow === 'add-existing' ? 'إضافة' : 'صرف'}
          createLabel={actionFlow === 'add-existing' ? 'صنف جديد' : undefined}
          onClose={() => setActionFlow(null)}
          onCreateNew={actionFlow === 'add-existing'
            ? () => setActionFlow('new-category')
            : undefined}
          onSelectItem={(item) =>
            beginOperation(
              item,
              actionFlow === 'add-existing' ? 'add' : 'issue',
            )}
        />
      ) : null}

      {activeCategory && operation.itemDetails && operation.selectedItemId ? (
        <InventoryOperationModal
          category={activeCategory}
          itemId={operation.selectedItemId}
          itemData={operation.itemDetails as Record<string, unknown> & ItemDetails}
          operationType={operation.operationType}
          form={operation.form}
          formErrors={operation.formErrors}
          isSubmitting={operation.isSubmitting}
          onClose={operation.close}
          onFieldChange={operation.updateField}
          onSubmit={operation.submit}
        />
      ) : null}

      {activeCategory && creation.isOpen ? (
        <ItemCreateModal
          category={activeCategory}
          form={creation.form}
          formErrors={creation.formErrors}
          isSubmitting={creation.isSubmitting}
          onClose={creation.close}
          onFieldChange={creation.updateField}
          onSubmit={creation.submit}
        />
      ) : null}
    </section>
  )
}
