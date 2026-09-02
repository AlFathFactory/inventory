import { DataFilters } from '../../../components/DataFilters'
import { DataTable, type DataTableColumn } from '../../../components/DataTable'
import { TablePagination } from '../../../components/TablePagination'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import type { CategorySummaryItem } from '../../../services/itemsService'
import type { CategoryMessage } from '../types'
import type { CategoryPageModel } from '../hooks/useCategoryPage'
import { ToastOnChange } from '../../../components/ToastProvider'

type CategoryTableSectionProps = {
  category: CategoryDefinition
  isCustodyCategory: boolean
  columns: DataTableColumn<CategorySummaryItem>[]
  onViewDetails: (row: CategorySummaryItem) => void
  onPrefetchItem: (row: CategorySummaryItem) => void
  message: CategoryMessage
  searchTerm: string
  onSearchChange: (value: string) => void
  projectOptions: string[]
  selectedProjectName: string
  onProjectChange: (value: string) => void
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
  onPrefetchItem,
  message,
  searchTerm,
  onSearchChange,
  projectOptions,
  selectedProjectName,
  onProjectChange,
  rows,
  pagination,
  isLoading,
  isPreparingOperation,
  error,
}: CategoryTableSectionProps) {
  return (
    <>
      <ToastOnChange message={message?.text ?? null} type={message?.type} />

      <DataFilters
        searchValue={searchTerm}
        onSearchChange={onSearchChange}
        searchPlaceholder={category.table === 'cutting_discs'
          ? 'ابحث بالكود أو النوع أو المستلم أو الملاحظات'
          : isCustodyCategory
          ? 'ابحث بالكود أو النوع أو المستلم أو المصدر'
          : category.table === 'raw_materials'
            ? 'ابحث بكود الصنف أو رقم الكود أو نوع الخامة أو الأبعاد أو المصدر'
            : 'ابحث بكود الصنف أو اسم الصنف أو القسم أو المورد أو المصدر أو الكود الخارجي أو DIN'}
      >
        {!isCustodyCategory && category.table !== 'raw_materials' ? (
          <label className="min-w-[200px] flex-[0_1_240px] space-y-2">
            <span className="block text-sm font-medium text-slate-700">القسم</span>
            <select value={selectedProjectName} onChange={(event) => onProjectChange(event.target.value)} className="w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400">
              <option value="">كل الأقسام</option>
              {projectOptions.map((projectName) => <option key={projectName} value={projectName}>{projectName}</option>)}
            </select>
          </label>
        ) : null}
      </DataFilters>

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
            onRowPrefetch={onPrefetchItem}
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
