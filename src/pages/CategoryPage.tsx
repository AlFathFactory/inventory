import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DataFilters } from '../components/DataFilters'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { TablePagination } from '../components/TablePagination'
import {
  categoryConfig,
  type CategoryDefinition,
  type CategoryKey,
} from '../config/categoryConfig'
import { usePagination } from '../hooks/usePagination'
import {
  getCategoryRows,
  getCategoryRowsByDateRange,
  type InventoryRow,
} from '../services/inventoryService'
import {
  getStockStatus,
  getStockStatusClass,
  getStockStatusLabel,
} from '../utils/statusUtils'

function isCategoryKey(value: string): value is CategoryKey {
  return value in categoryConfig
}

function getDisplayValue(value: InventoryRow[string]) {
  if (Array.isArray(value)) {
    return value.join(', ')
  }

  if (value === null || value === undefined || value === '') {
    return '—'
  }

  return String(value)
}

export function CategoryPage() {
  const { categoryKey } = useParams()
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const category: CategoryDefinition | null =
    categoryKey && isCategoryKey(categoryKey)
      ? (categoryConfig[categoryKey] as CategoryDefinition)
      : null

  const deferredSearchTerm = useDeferredValue(searchTerm)
  const hasDateFilter = Boolean(
    category?.dateField && fromDate.trim() && toDate.trim(),
  )

  useEffect(() => {
    if (!category) {
      setRows([])
      setError(null)
      setIsLoading(false)
      return
    }

    const activeCategory = category
    let isCancelled = false

    async function loadRows() {
      setIsLoading(true)
      setError(null)

      const result = hasDateFilter
        ? await getCategoryRowsByDateRange(
            activeCategory.table,
            activeCategory.dateField,
            fromDate,
            toDate,
          )
        : await getCategoryRows(activeCategory.table)

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
  }, [category, fromDate, hasDateFilter, toDate])

  const normalizedSearchTerm = deferredSearchTerm.trim().toLowerCase()
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (!normalizedSearchTerm || !category) {
          return true
        }

        return category.searchableFields.some((field) => {
          const fieldValue = row[field]
          const displayValue = Array.isArray(fieldValue)
            ? fieldValue.join(' ')
            : String(fieldValue ?? '')

          return displayValue.toLowerCase().includes(normalizedSearchTerm)
        })
      }),
    [category, normalizedSearchTerm, rows],
  )
  const pagination = usePagination(filteredRows, { initialPageSize: 10 })

  const columns = useMemo<DataTableColumn<InventoryRow>[]>(() => {
    if (!category) {
      return []
    }

    const nextColumns: DataTableColumn<InventoryRow>[] = []
    const columnEntries = Object.entries(category.columns)
    const hasStockStatus =
      Boolean(category.stockField) && Boolean(category.minQuantityField)

    columnEntries.forEach(([field, label]) => {
      nextColumns.push({
        id: field,
        header: label,
        headerClassName: 'px-4 py-3 text-slate-700',
        cellClassName: 'whitespace-nowrap px-4 py-3 text-slate-600',
        renderCell: (row) => getDisplayValue(row[field]),
      })
    })

    if (hasStockStatus) {
      nextColumns.push({
        id: 'status',
        header: 'الحالة',
        headerClassName: 'px-4 py-3 text-slate-700',
        cellClassName: 'align-top px-4 py-3',
        renderCell: (row) => {
          const stockStatus =
            category.stockField && category.minQuantityField
              ? getStockStatus(
                  row,
                  category.stockField,
                  category.minQuantityField,
                )
              : null

          return stockStatus ? (
            <span
              className={[
                'inline-flex rounded-full px-3 py-1 text-xs font-medium',
                getStockStatusClass(stockStatus),
              ].join(' ')}
            >
              {getStockStatusLabel(stockStatus)}
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              غير محدد
            </span>
          )
        },
      })
    }

    return nextColumns
  }, [category])

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
    <section className="space-y-6">
      <DataFilters
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="ابحث داخل الجدول"
        showDateFilter={Boolean(category.dateField)}
        dateRange={{ fromDate, toDate }}
        onDateRangeChange={({ fromDate: nextFromDate, toDate: nextToDate }) => {
          setFromDate(nextFromDate)
          setToDate(nextToDate)
        }}
      />

      {isLoading ? (
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-10 text-center text-sm text-slate-500 shadow-[var(--app-shadow)]">
          جاري تحميل البيانات...
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
            getRowKey={(_, index) => `${category.table}-${pagination.pageStart + index}`}
            stickyHeader
            maxHeightClassName="max-h-[70vh] overflow-auto"
            tableClassName="divide-y divide-slate-200"
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
    </section>
  )
}
