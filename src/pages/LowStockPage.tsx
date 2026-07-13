import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { DataFilters } from '../components/DataFilters'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { TablePagination } from '../components/TablePagination'
import {
  categoryEntries,
  type CategoryDefinition,
  type CategoryKey,
} from '../config/categoryConfig'
import { usePagination } from '../hooks/usePagination'
import {
  getSupabaseConfigError,
  isSupabaseConfigured,
} from '../lib/supabaseClient'
import {
  getLowStockRows,
  getOutOfStockRows,
  type InventoryRow,
} from '../services/inventoryService'
import {
  getStockStatusClass,
  getStockStatusLabel,
  type StockStatus,
} from '../utils/statusUtils'

type LowStockRow = {
  id: string
  categoryKey: CategoryKey
  categoryLabel: string
  itemName: string
  projectName: string | null
  dateLabel: string
  stockBalance: number | null
  minQuantity: number | null
  status: StockStatus
  searchText: string
}

type LowStockState = {
  rows: LowStockRow[]
  isLoading: boolean
  error: string | null
}

type StockStatusFilter = 'all' | 'low' | 'out'

type StockCategoryDefinition = CategoryDefinition & {
  stockField: string
  minQuantityField: string
}

function hasStockConfig(
  category: CategoryDefinition,
): category is StockCategoryDefinition {
  return Boolean(category.stockField && category.minQuantityField)
}

function hasOnlyStockField(
  category: CategoryDefinition,
): category is CategoryDefinition & { stockField: string } {
  return Boolean(category.stockField) && !category.minQuantityField
}

function extractStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function extractNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalizedValue = Number(value)
    return Number.isFinite(normalizedValue) ? normalizedValue : null
  }

  return null
}

function formatInventoryDate(value: unknown): string {
  const dateValue = extractStringValue(value)

  if (!dateValue) {
    return '—'
  }

  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) {
    return dateValue
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  return `${day}/${month}/${year}`
}

function getItemName(row: InventoryRow): string {
  return (
    extractStringValue(row.item_name) ??
    extractStringValue(row.type_name) ??
    extractStringValue(row.code) ??
    'عنصر غير مسمى'
  )
}

function buildSearchText(
  category: CategoryDefinition,
  row: InventoryRow,
  itemName: string,
) {
  const searchableValues = category.searchableFields
    .map((field) => row[field])
    .map((value) => {
      if (Array.isArray(value)) {
        return value.join(' ')
      }

      return String(value ?? '')
    })
    .join(' ')

  return [category.label, category.table, itemName, searchableValues]
    .join(' ')
    .toLowerCase()
}

function mapLowStockRows(
  categoryKey: CategoryKey,
  category: CategoryDefinition,
  rows: InventoryRow[],
): LowStockRow[] {
  return rows.map((row, index) => {
    const itemName = getItemName(row)
    const stockBalance = category.stockField
      ? extractNumberValue(row[category.stockField])
      : null
    const minQuantity = category.minQuantityField
      ? extractNumberValue(row[category.minQuantityField])
      : null
    const status: StockStatus = stockBalance !== null && stockBalance <= 0 ? 'out' : 'low'

    return {
      id: `${category.table}-low-${index}`,
      categoryKey,
      categoryLabel: category.label,
      itemName,
      projectName:
        extractStringValue(row.project) ?? extractStringValue(row.received_by),
      dateLabel: formatInventoryDate(row[category.dateField]),
      stockBalance,
      minQuantity,
      status,
      searchText: buildSearchText(category, row, itemName),
    }
  })
}

function mapOutOfStockRows(
  categoryKey: CategoryKey,
  category: CategoryDefinition & { stockField: string },
  rows: InventoryRow[],
): LowStockRow[] {
  return rows.map((row, index) => {
    const itemName = getItemName(row)

    return {
      id: `${category.table}-out-${index}`,
      categoryKey,
      categoryLabel: category.label,
      itemName,
      projectName:
        extractStringValue(row.project) ?? extractStringValue(row.received_by),
      dateLabel: formatInventoryDate(row[category.dateField]),
      stockBalance: extractNumberValue(row[category.stockField]),
      minQuantity: null,
      status: 'out',
      searchText: buildSearchText(category, row, itemName),
    }
  })
}

function formatNumber(value: number | null) {
  return value === null ? '—' : value.toLocaleString()
}

const columns: DataTableColumn<LowStockRow>[] = [
  {
    id: 'status',
    header: 'الحالة',
    renderCell: (row) => (
      <span
        className={[
          'inline-flex min-w-[78px] items-center justify-center rounded-full px-3 py-1 text-xs font-bold',
          getStockStatusClass(row.status),
        ].join(' ')}
      >
        {getStockStatusLabel(row.status)}
      </span>
    ),
  },
  {
    id: 'categoryLabel',
    header: 'القسم',
    renderCell: (row) => row.categoryLabel,
  },
  {
    id: 'itemName',
    header: 'الصنف',
    renderCell: (row) => (
      <p className="font-semibold text-slate-800">{row.itemName}</p>
    ),
  },
  {
    id: 'projectName',
    header: 'المشروع',
    renderCell: (row) => row.projectName ?? '—',
  },
  {
    id: 'dateLabel',
    header: 'التاريخ',
    renderCell: (row) => row.dateLabel,
  },
  {
    id: 'stockBalance',
    header: 'الرصيد الحالي',
    renderCell: (row) => formatNumber(row.stockBalance),
  },
  {
    id: 'minQuantity',
    header: 'الحد الأدنى',
    renderCell: (row) => formatNumber(row.minQuantity),
  },
]

export function LowStockPage() {
  const [state, setState] = useState<LowStockState>({
    rows: [],
    isLoading: true,
    error: null,
  })
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase()
  const configError = !isSupabaseConfigured ? getSupabaseConfigError() : null

  useEffect(() => {
    let isCancelled = false

    async function loadRows() {
      if (!isSupabaseConfigured) {
        setState({
          rows: [],
          isLoading: false,
          error: null,
        })
        return
      }

      setState((currentValue) => ({
        ...currentValue,
        isLoading: true,
        error: null,
      }))

      const requests = categoryEntries.reduce<
        Array<
          Promise<{
            rows: LowStockRow[]
            error: string | null
          }>
        >
      >((promises, [categoryKey, category]) => {
        if (hasStockConfig(category)) {
          promises.push(
            (async () => {
              const result = await getLowStockRows(
                category.table,
                category.stockField,
                category.minQuantityField,
              )

              return {
                rows: result.data
                  ? mapLowStockRows(categoryKey, category, result.data)
                  : [],
                error: result.error
                  ? `فشل تحميل جدول ${category.label}: ${result.error}`
                  : null,
              }
            })(),
          )

          return promises
        }

        if (hasOnlyStockField(category)) {
          promises.push(
            (async () => {
              const result = await getOutOfStockRows(
                category.table,
                category.stockField,
              )

              return {
                rows: result.data
                  ? mapOutOfStockRows(categoryKey, category, result.data)
                  : [],
                error: result.error
                  ? `فشل تحميل جدول ${category.label}: ${result.error}`
                  : null,
              }
            })(),
          )
        }

        return promises
      }, [])

      const results = await Promise.all(requests)

      if (isCancelled) {
        return
      }

      const rows = results
        .flatMap((result) => result.rows)
        .sort((firstRow, secondRow) => {
          if (firstRow.status !== secondRow.status) {
            return firstRow.status === 'out' ? -1 : 1
          }

          return secondRow.id.localeCompare(firstRow.id)
        })
      const error = results
        .map((result) => result.error)
        .filter((value): value is string => Boolean(value))
        .join(' | ')

      setState({
        rows,
        isLoading: false,
        error: error || null,
      })
    }

    void loadRows()

    return () => {
      isCancelled = true
    }
  }, [])

  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>('all')

  const searchedRows = useMemo(
    () =>
      state.rows.filter((row) => {
        if (!normalizedSearchTerm) {
          return true
        }

        return row.searchText.includes(normalizedSearchTerm)
      }),
    [normalizedSearchTerm, state.rows],
  )

  const filteredRows = useMemo(
    () =>
      searchedRows.filter(
        (row) => statusFilter === 'all' || row.status === statusFilter,
      ),
    [searchedRows, statusFilter],
  )

  const pagination = usePagination(filteredRows, { initialPageSize: 10 })
  const outOfStockCount = searchedRows.filter((row) => row.status === 'out').length
  const lowStockCount = searchedRows.filter((row) => row.status === 'low').length

  return (
    <section className="space-y-6">
      {configError ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Supabase is not configured for this deployment. {configError}
        </div>
      ) : null}

      {state.error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel)] px-5 py-4 shadow-[var(--app-shadow)]">
          <p className="text-sm text-[var(--app-text-muted)]">إجمالي النتائج</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {filteredRows.length}
          </p>
        </div>
        <div className="rounded-[24px] border border-red-100 bg-red-50 px-5 py-4 shadow-[var(--app-shadow)]">
          <p className="text-sm text-red-700">كمية فارغة</p>
          <p className="mt-2 text-2xl font-bold text-red-700">
            {outOfStockCount}
          </p>
        </div>
        <div className="rounded-[24px] border border-amber-100 bg-amber-50 px-5 py-4 shadow-[var(--app-shadow)]">
          <p className="text-sm text-amber-700">كمية قليلة</p>
          <p className="mt-2 text-2xl font-bold text-amber-700">
            {lowStockCount}
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] p-4 shadow-[var(--app-shadow)] md:p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              الأصناف التي تحتاج متابعة
            </p>
            <p className="text-sm text-[var(--app-text-muted)]">
              الجدول يجمع الأصناف ذات الكمية القليلة والأصناف الفارغة في مكان واحد.
            </p>
          </div>
          <p className="text-sm text-slate-500">النتائج: {filteredRows.length}</p>
        </div>

        <DataFilters
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="ابحث باسم الصنف أو المشروع أو القسم"
        >
          <label className="min-w-[190px] flex-[0_1_230px] space-y-2">
            <span className="block text-sm font-medium text-slate-700">
              حالة المخزون
            </span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StockStatusFilter)
              }
              className="w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            >
              <option value="all">كل الأصناف</option>
              <option value="low">أصناف قليلة</option>
              <option value="out">أصناف منتهية</option>
            </select>
          </label>
        </DataFilters>

        {state.isLoading ? (
          <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-slate-500">
            جاري تحميل الأصناف قليلة الكمية والفارغة...
          </div>
        ) : null}

        {!state.isLoading && filteredRows.length === 0 ? (
          <div className="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-10 text-center text-sm text-slate-500">
            لا توجد أصناف قليلة أو فارغة مطابقة للبحث الحالي.
          </div>
        ) : null}

        {!state.isLoading && filteredRows.length > 0 ? (
          <div className="overflow-hidden rounded-[24px] border border-[var(--app-border)]">
            <DataTable
              columns={columns}
              rows={pagination.paginatedItems}
              getRowKey={(row) => row.id}
              stickyHeader
              maxHeightClassName="max-h-[70vh] overflow-auto"
              tableClassName="divide-y divide-slate-200 bg-white"
              rowClassName="hover:bg-slate-50"
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
      </div>
    </section>
  )
}
