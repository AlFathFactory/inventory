import { DataFilters } from '../../../components/DataFilters'
import { DataTable, type DataTableColumn } from '../../../components/DataTable'
import { TablePagination } from '../../../components/TablePagination'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import type { CategorySummaryItem } from '../../../services/itemsService'
import type { CategoryMessage } from '../types'
import type { CategoryPageModel } from '../hooks/useCategoryPage'

type CategoryTableSectionProps = {
  category: CategoryDefinition
  isCustodyCategory: boolean
  columns: DataTableColumn<CategorySummaryItem>[]
  onViewDetails: (row: CategorySummaryItem) => void
  message: CategoryMessage
  searchTerm: string
  onSearchChange: (value: string) => void
  rows: CategorySummaryItem[]
  pagination: CategoryPageModel['pagination']
  isLoading: boolean
  isPreparingOperation: boolean
  error: string | null
}

export function CategoryTableSection({
  category,
  isCustodyCategory,
  columns,
  onViewDetails,
  message,
  searchTerm,
  onSearchChange,
  rows,
  pagination,
  isLoading,
  isPreparingOperation,
  error,
}: CategoryTableSectionProps) {
  return (
    <>
      {message ? (
        <div className={[
          'rounded-[24px] border px-5 py-4 text-sm',
          message.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700',
        ].join(' ')}>
          {message.text}
        </div>
      ) : null}

      <DataFilters
        searchValue={searchTerm}
        onSearchChange={onSearchChange}
        searchPlaceholder={isCustodyCategory
          ? 'ابحث بالكود أو النوع أو المستلم أو المصدر'
          : 'ابحث باسم المشروع أو الصنف أو الحالة'}
      />

      {isLoading ? <StatusPanel>جاري تحميل البيانات...</StatusPanel> : null}
      {isPreparingOperation ? <StatusPanel compact>جاري تجهيز بيانات الصنف...</StatusPanel> : null}
      {!isLoading && error ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-600">
          حدث خطأ أثناء تحميل البيانات: {error}
        </div>
      ) : null}
      {!isLoading && !error && rows.length === 0 ? (
        <StatusPanel>لا توجد بيانات لعرضها</StatusPanel>
      ) : null}

      {!isLoading && !error && rows.length > 0 ? (
        <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
          <DataTable
            columns={columns}
            rows={pagination.paginatedItems}
            getRowKey={(row) => `${category.table}-${row.item_id}`}
            stickyHeader
            maxHeightClassName="max-h-[70vh] overflow-auto"
            tableClassName="divide-y divide-slate-200"
            rowClassName="hover:bg-slate-50"
            onRowClick={onViewDetails}
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
    </>
  )
}

function StatusPanel({
  children,
  compact = false,
}: {
  children: React.ReactNode
  compact?: boolean
}) {
  return (
    <div className={`rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-4 text-center text-sm text-slate-500 shadow-[var(--app-shadow)] ${compact ? 'py-6' : 'py-10'}`}>
      {children}
    </div>
  )
}
