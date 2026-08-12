import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { SearchInput } from '../components/SearchInput'
import { TablePagination } from '../components/TablePagination'
import { ToastOnChange } from '../components/ToastProvider'
import {
  categoryConfig,
  operationCategoryOptions,
  type CategoryDefinition,
} from '../config/categoryConfig'
import { useCategoryOperation } from '../features/category/hooks/useCategoryOperation'
import type { CategoryMessage } from '../features/category/types'
import type { DashboardInventoryRow } from '../features/dashboard/types'
import { useDashboardData } from '../features/dashboard/hooks/useDashboardData'
import { InventoryOperationModal } from '../features/inventory-operations/InventoryOperationModal'
import { useSearchParamsPagination } from '../hooks/useSearchParamsPagination'
import {
  getSupabaseConfigError,
  isSupabaseConfigured,
} from '../lib/supabaseClient'
import type { CategorySummaryItem, ItemDetails } from '../services/itemsService'
import { includesSearchTerm, normalizeSearchTerm } from '../utils/searchUtils'

type PendingStocktake = {
  requestId: number
  row: DashboardInventoryRow
}

function toSummaryItem(row: DashboardInventoryRow): CategorySummaryItem {
  if (row.categoryKey === 'dynamic') {
    throw new Error('toSummaryItem does not support dynamic inventory rows')
  }
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
    status: null,
    total_added: row.addedQuantity,
    total_issued: row.issuedQuantity,
    source_rows_count: 1,
    updated_at: row.updatedAt,
    created_at: null,
  }
}

function displayNumber(value: number | null) {
  return value === null ? '—' : value.toLocaleString('en-US')
}

export function StocktakePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const dashboard = useDashboardData()
  const searchTerm = searchParams.get('search') ?? ''
  const categoryFilter = searchParams.get('category') ?? ''
  const [message, setMessage] = useState<CategoryMessage>(null)
  const [pendingStocktake, setPendingStocktake] = useState<PendingStocktake | null>(null)
  const requestSequence = useRef(0)
  const handledRequest = useRef<number | null>(null)
  const activeCategory: CategoryDefinition | null =
    pendingStocktake && pendingStocktake.row.categoryKey !== 'dynamic'
      ? categoryConfig[pendingStocktake.row.categoryKey]
      : null
  const operation = useCategoryOperation({ category: activeCategory, setMessage })

  const rows = useMemo(() => {
    const normalizedSearch = normalizeSearchTerm(searchTerm)

    return dashboard.data.inventoryRows.filter((row) => (
      row.categoryKey !== 'dynamic' &&
      Boolean(categoryConfig[row.categoryKey].operationsEnabled) &&
      (!categoryFilter || row.categoryKey === categoryFilter) &&
      includesSearchTerm(row.searchText, normalizedSearch)
    ))
  }, [categoryFilter, dashboard.data.inventoryRows, searchTerm])
  const pagination = useSearchParamsPagination(rows, { initialPageSize: 20 })

  useEffect(() => {
    if (
      !pendingStocktake ||
      handledRequest.current === pendingStocktake.requestId
    ) {
      return
    }

    handledRequest.current = pendingStocktake.requestId
    void operation.open(toSummaryItem(pendingStocktake.row), 'adjust')
  }, [operation, pendingStocktake])

  function updateFilter(name: 'search' | 'category', value: string) {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams)
      nextParams.delete('page')
      if (value) nextParams.set(name, value)
      else nextParams.delete(name)
      return nextParams
    }, { replace: true })
  }

  function beginStocktake(row: DashboardInventoryRow) {
    setMessage(null)
    setPendingStocktake({
      requestId: ++requestSequence.current,
      row,
    })
  }

  const columns = useMemo<DataTableColumn<DashboardInventoryRow>[]>(() => [
    {
      id: 'internalCode',
      header: 'كود الصنف',
      renderCell: (row) => (
        <span dir="ltr" className="select-all font-mono font-semibold text-slate-700">
          {row.internalCode ?? '—'}
        </span>
      ),
    },
    {
      id: 'categoryLabel',
      header: 'المخزن',
      renderCell: (row) => row.categoryLabel,
    },
    {
      id: 'itemName',
      header: 'الصنف',
      renderCell: (row) => <span className="font-semibold text-slate-900">{row.itemName}</span>,
    },
    {
      id: 'projectName',
      header: 'القسم',
      renderCell: (row) => row.projectName ?? '—',
    },
    {
      id: 'stockBalance',
      header: 'الرصيد الحالي',
      renderCell: (row) => <span className="font-bold text-slate-900">{displayNumber(row.stockBalance)}</span>,
    },
    {
      id: 'action',
      header: 'الإجراء',
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      renderCell: (row) => (
        <button
          type="button"
          onClick={() => beginStocktake(row)}
          disabled={operation.isPreparing}
          className="inline-flex h-9 min-w-20 items-center justify-center rounded-xl bg-blue-600 px-4 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
        >
          {operation.isPreparing && pendingStocktake?.row.id === row.id ? 'جاري...' : 'جرد'}
        </button>
      ),
    },
  ], [operation.isPreparing, pendingStocktake?.row.id])

  const configError = !isSupabaseConfigured ? getSupabaseConfigError() : null

  return (
    <section dir="rtl" className="space-y-5">
      <ToastOnChange message={message?.text ?? null} type={message?.type} />

      <div className="rounded-[28px] border border-[var(--app-border)] bg-white p-6 shadow-[var(--app-shadow)]">
        <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          الإدارة
        </span>
        <h1 className="mt-3 text-2xl font-bold text-slate-950">جرد المخزون</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
          ابحث عن الصنف ثم أدخل الرصيد الفعلي النهائي. سيُسجّل التغيير كحركة جرد مستقلة.
        </p>
      </div>

      {configError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {configError}
        </div>
      ) : null}
      {dashboard.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {dashboard.error}
        </div>
      ) : null}

      <div className="rounded-[26px] border border-[var(--app-border)] bg-white p-4 shadow-[var(--app-shadow)]">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(180px,260px)_auto] md:items-center">
          <SearchInput
            value={searchTerm}
            onValueChange={(value) => updateFilter('search', value)}
            placeholder="ابحث بالكود أو الصنف أو القسم"
            className="h-11 rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none focus:border-[var(--app-primary)]"
          />
          <select
            value={categoryFilter}
            onChange={(event) => updateFilter('category', event.target.value)}
            className="h-11 rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm text-slate-700 outline-none focus:border-[var(--app-primary)]"
          >
            <option value="">كل المخازن</option>
            {operationCategoryOptions.map((category) => (
              <option key={category.key} value={category.key}>{category.label}</option>
            ))}
          </select>
          <span className="text-sm font-semibold text-slate-500">
            {rows.length.toLocaleString('en-US')} صنف
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-white shadow-[var(--app-shadow)]">
        {dashboard.isLoading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">جاري تحميل الأصناف...</div>
        ) : pagination.paginatedItems.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">لا توجد أصناف مطابقة.</div>
        ) : (
          <DataTable
            columns={columns}
            rows={pagination.paginatedItems}
            getRowKey={(row) => row.id}
            stickyHeader
            maxHeightClassName="max-h-[70vh] overflow-auto"
            rowClassName="hover:bg-slate-50"
          />
        )}

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

      {activeCategory && operation.operationType && operation.itemDetails && operation.selectedItemId ? (
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
    </section>
  )
}
