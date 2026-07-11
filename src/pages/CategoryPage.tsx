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
import { usePagination } from '../hooks/usePagination'
import {
  getCategorySummaryItems,
  type CategorySummaryItem,
} from '../services/itemsService'
import { getStockStatusClass } from '../utils/statusUtils'

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
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const category: CategoryDefinition | null =
    categoryKey && isCategoryKey(categoryKey)
      ? (categoryConfig[categoryKey] as CategoryDefinition)
      : null

  const deferredSearchTerm = useDeferredValue(searchTerm)

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

        return [row.project_name, row.item_name, row.status]
          .map((value) => String(value ?? '').toLowerCase())
          .some((value) => value.includes(normalizedSearchTerm))
      }),
    [normalizedSearchTerm, rows],
  )

  const pagination = usePagination(filteredRows, { initialPageSize: 10 })

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
      {
        id: 'actions',
        header: 'إجراءات',
        headerClassName: 'px-4 py-3 text-slate-700',
        cellClassName: 'px-4 py-3',
        renderCell: () => (
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            عرض التفاصيل
          </span>
        ),
      },
    ],
    [],
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
    </section>
  )
}
