import { useMemo, useState } from 'react'
import type { DataTableColumn } from '../components/DataTable'
import { DataTable } from '../components/DataTable'
import { TablePagination } from '../components/TablePagination'
import { DashboardStatCard } from '../features/dashboard/components/DashboardStatCard'
import { projectsQueryOptions } from '../features/projects/projectQueries'
import { useInventoryReport } from '../features/reports/reportQueries'
import { usePagination } from '../hooks/usePagination'
import type { InventoryReportRow } from '../services/operationsService'
import { operationCategoryOptions } from '../config/categoryConfig'
import { useQuery } from '@tanstack/react-query'

const numberFormatter = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 })
const dateFormatter = new Intl.DateTimeFormat('ar-EG', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function formatDate(value: string) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

function displayValue(value: number | string | null) {
  if (value === null || value === '') return '—'
  return typeof value === 'number' ? numberFormatter.format(value) : value
}

const baseColumns: DataTableColumn<InventoryReportRow>[] = [
  {
    id: 'item',
    header: 'اسم الصنف',
    renderCell: (row) => <span className="font-semibold text-slate-900">{row.itemName}</span>,
  },
  { id: 'category', header: 'القسم', renderCell: (row) => row.categoryName },
  { id: 'project', header: 'السجل', renderCell: (row) => row.projectName },
]

const rawMaterialColumns: DataTableColumn<InventoryReportRow>[] = [
  { id: 'codeNumber', header: 'رقم الكود', renderCell: (row) => displayValue(row.codeNumber) },
  { id: 'weight', header: 'وزن', renderCell: (row) => displayValue(row.weight) },
  { id: 'length', header: 'LENGTH', renderCell: (row) => displayValue(row.length) },
  { id: 'width', header: 'WIDTH', renderCell: (row) => displayValue(row.width) },
  { id: 'th', header: 'TH', renderCell: (row) => displayValue(row.th) },
]

const operationColumns: DataTableColumn<InventoryReportRow>[] = [
  {
    id: 'type',
    header: 'نوع العملية',
    renderCell: (row) => (
      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${row.operationType === 'add' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
        {row.operationType === 'add' ? 'إضافة' : 'صرف'}
      </span>
    ),
  },
  {
    id: 'quantity',
    header: 'الكمية',
    renderCell: (row) => numberFormatter.format(row.quantity),
    cellClassName: 'font-semibold tabular-nums',
  },
  {
    id: 'date',
    header: 'التاريخ',
    renderCell: (row) => formatDate(row.operationDate),
    cellClassName: 'whitespace-nowrap',
  },
]

export function ReportsPage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [projectName, setProjectName] = useState('')
  const projectsQuery = useQuery(projectsQueryOptions)
  const hasInvalidRange = Boolean(fromDate && toDate && fromDate > toDate)
  const filters = useMemo(
    () => ({ fromDate, toDate, categoryName, projectName }),
    [categoryName, fromDate, projectName, toDate],
  )
  const reportQuery = useInventoryReport(filters, !hasInvalidRange)
  const report = reportQuery.data
  const columns = useMemo(
    () => categoryName === 'خامات'
      ? [...baseColumns, ...rawMaterialColumns, ...operationColumns]
      : [...baseColumns, ...operationColumns],
    [categoryName],
  )
  const pagination = usePagination(report?.rows ?? [], { initialPageSize: 10 })
  const errorMessage = reportQuery.error instanceof Error
    ? reportQuery.error.message
    : reportQuery.error
      ? 'تعذر تحميل بيانات التقارير'
      : null

  return (
    <section dir="rtl" className="space-y-6" aria-busy={reportQuery.isPending || reportQuery.isFetching}>
      <header className="rounded-[28px] border border-[var(--app-border)] bg-white p-6 shadow-[var(--app-shadow)]">
        <h1 className="text-2xl font-bold text-slate-900">تقارير حركة المخزون</h1>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">
          ملخص تفصيلي لعمليات الإضافة والصرف خلال الفترة المحددة.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2">
            <span className="block text-sm font-semibold text-slate-700">من تاريخ</span>
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none transition focus:border-[var(--app-primary)]" />
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-semibold text-slate-700">إلى تاريخ</span>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none transition focus:border-[var(--app-primary)]" />
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-semibold text-slate-700">القسم</span>
            <select value={categoryName} onChange={(event) => setCategoryName(event.target.value)} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none transition focus:border-[var(--app-primary)]">
              <option value="">جميع الأقسام</option>
              {operationCategoryOptions.map((category) => <option key={category.key} value={category.label}>{category.label}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-semibold text-slate-700">السجل</span>
            <select value={projectName} onChange={(event) => setProjectName(event.target.value)} disabled={projectsQuery.isPending} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none transition focus:border-[var(--app-primary)] disabled:bg-slate-50 disabled:text-slate-500">
              <option value="">{projectsQuery.isPending ? 'جاري تحميل السجلات...' : 'جميع السجلات'}</option>
              {(projectsQuery.data ?? []).map((project) => <option key={project.id} value={project.name}>{project.name}</option>)}
            </select>
          </label>
        </div>
        {(fromDate || toDate || categoryName || projectName) ? (
          <button type="button" onClick={() => { setFromDate(''); setToDate(''); setCategoryName(''); setProjectName('') }} className="mt-4 text-sm font-bold text-[var(--app-primary)] hover:underline">
            مسح جميع الفلاتر
          </button>
        ) : null}
      </header>

      {hasInvalidRange ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">تاريخ البداية يجب أن يسبق تاريخ النهاية.</div> : null}
      {errorMessage ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => void reportQuery.refetch()} className="self-start rounded-xl bg-white px-4 py-2 font-bold shadow-sm sm:self-auto">إعادة المحاولة</button>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard caption="عدد عمليات الإضافة" value={numberFormatter.format(report?.summary.additionOperationsCount ?? 0)} helper="عمليات الإضافة المحددة" accentClassName="text-emerald-600" />
        <DashboardStatCard caption="إجمالي الكمية المضافة" value={numberFormatter.format(report?.summary.totalAddedQuantity ?? 0)} helper="مجموع الكميات المضافة" accentClassName="text-emerald-600" />
        <DashboardStatCard caption="عدد عمليات الصرف" value={numberFormatter.format(report?.summary.issueOperationsCount ?? 0)} helper="عمليات الصرف المحددة" accentClassName="text-orange-500" />
        <DashboardStatCard caption="إجمالي الكمية المصروفة" value={numberFormatter.format(report?.summary.totalIssuedQuantity ?? 0)} helper="مجموع الكميات المصروفة" accentClassName="text-orange-500" />
      </div>

      <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-white shadow-[var(--app-shadow)]">
        <div className="flex flex-col gap-1 border-b border-[var(--app-border)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">تفاصيل العمليات</h2>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">تظهر عمليات الإضافة والصرف فقط.</p>
          </div>
          {report ? <span className="text-sm text-slate-500">النتائج: {numberFormatter.format(report.rows.length)}</span> : null}
        </div>

        {reportQuery.isPending ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm font-semibold text-slate-600" role="status">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" aria-hidden="true" />
            جاري تحميل التقرير...
          </div>
        ) : null}

        {!reportQuery.isPending && !errorMessage && report?.rows.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <p className="font-bold text-slate-800">لا توجد عمليات خلال الفترة المحددة</p>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">غيّر تاريخ البداية أو النهاية لعرض نتائج أخرى.</p>
          </div>
        ) : null}

        {!reportQuery.isPending && report && report.rows.length > 0 ? (
          <>
            <DataTable columns={columns} rows={pagination.paginatedItems} getRowKey={(row) => row.id} rowClassName="transition hover:bg-slate-50" />
            <TablePagination currentPage={pagination.currentPage} pageSize={pagination.pageSize} totalItems={pagination.totalItems} totalPages={pagination.totalPages} pageStart={pagination.pageStart} pageEnd={pagination.pageEnd} onPageChange={pagination.setCurrentPage} onPageSizeChange={pagination.setPageSize} />
          </>
        ) : null}
      </div>
    </section>
  )
}
