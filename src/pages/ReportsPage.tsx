import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { DataTableColumn } from '../components/DataTable'
import { DataTable } from '../components/DataTable'
import { SearchInput } from '../components/SearchInput'
import { TablePagination } from '../components/TablePagination'
import { projectsQueryOptions } from '../features/projects/projectQueries'
import { useInventoryReport } from '../features/reports/reportQueries'
import { generateInventoryReportPdf } from '../features/reports/generateInventoryReportPdf'
import { generateInventoryReportExcel } from '../features/reports/generateInventoryReportExcel'
import { getCompleteInventoryReport, type InventoryReportRow } from '../services/operationsService'
import { operationCategoryOptions } from '../config/categoryConfig'
import { useQuery } from '@tanstack/react-query'
import { getItemDetailsRoute } from '../features/items/itemRoutes'

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
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
  { id: 'category', header: 'المخزن', renderCell: (row) => row.categoryName },
  { id: 'project', header: 'القسم', renderCell: (row) => row.projectName },
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
    id: 'totalAdded',
    header: 'إجمالي الكمية المضافة',
    renderCell: (row) => numberFormatter.format(row.totalAddedQuantity),
    cellClassName: 'font-bold tabular-nums text-emerald-700',
  },
  {
    id: 'totalIssued',
    header: 'إجمالي الكمية المصروفة',
    renderCell: (row) => numberFormatter.format(row.totalIssuedQuantity),
    cellClassName: 'font-bold tabular-nums text-orange-700',
  },
]

export function ReportsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [urlSearchParams, setUrlSearchParams] = useSearchParams()
  const [fromDate, setFromDate] = useState(() => urlSearchParams.get('from') ?? '')
  const [toDate, setToDate] = useState(() => urlSearchParams.get('to') ?? '')
  const [categoryName, setCategoryName] = useState(() => urlSearchParams.get('category') ?? '')
  const [projectName, setProjectName] = useState(() => urlSearchParams.get('project') ?? '')
  const [operationType, setOperationType] = useState<'add' | 'issue' | 'both'>(() => {
    const value = urlSearchParams.get('operationType')
    return value === 'add' || value === 'issue' ? value : 'both'
  })
  const [searchInput, setSearchInput] = useState(() => urlSearchParams.get('search') ?? '')
  const [searchTerm, setSearchTerm] = useState(() => urlSearchParams.get('search') ?? '')
  const [currentPage, setCurrentPage] = useState(() => Math.max(1, Number(urlSearchParams.get('page')) || 1))
  const [pageSize, setPageSize] = useState(() => Math.max(1, Number(urlSearchParams.get('pageSize')) || 10))
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false)
  const projectsQuery = useQuery(projectsQueryOptions)
  const hasInvalidRange = Boolean(fromDate && toDate && fromDate > toDate)
  const filters = useMemo(
    () => ({ fromDate, toDate, categoryName, projectName, searchTerm, operationType, page: currentPage, pageSize }),
    [categoryName, currentPage, fromDate, operationType, pageSize, projectName, searchTerm, toDate],
  )
  const reportQuery = useInventoryReport(filters, !hasInvalidRange)
  const report = reportQuery.data
  const columns = useMemo(
    () => {
      const selectedOperationColumns = operationType === 'both'
        ? operationColumns
        : operationColumns.filter((column) => column.id === (operationType === 'add' ? 'totalAdded' : 'totalIssued'))
      return categoryName === 'خامات'
        ? [...baseColumns, ...rawMaterialColumns, ...selectedOperationColumns]
        : [...baseColumns, ...selectedOperationColumns]
    },
    [categoryName, operationType],
  )
  const totalItems = report?.totalItems ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const pageStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = totalItems === 0
    ? 0
    : Math.min(pageStart + (report?.rows.length ?? 0) - 1, totalItems)

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSearchTerm(searchInput), 300)
    return () => window.clearTimeout(timeoutId)
  }, [searchInput])

  useEffect(() => {
    const nextParams = new URLSearchParams()
    if (fromDate) nextParams.set('from', fromDate)
    if (toDate) nextParams.set('to', toDate)
    if (categoryName) nextParams.set('category', categoryName)
    if (projectName) nextParams.set('project', projectName)
    if (operationType !== 'both') nextParams.set('operationType', operationType)
    if (searchInput) nextParams.set('search', searchInput)
    if (currentPage > 1) nextParams.set('page', String(currentPage))
    if (pageSize !== 10) nextParams.set('pageSize', String(pageSize))

    if (nextParams.toString() !== urlSearchParams.toString()) {
      setUrlSearchParams(nextParams, { replace: true })
    }
  }, [categoryName, currentPage, fromDate, operationType, pageSize, projectName, searchInput, setUrlSearchParams, toDate, urlSearchParams])
  const errorMessage = reportQuery.error instanceof Error
    ? reportQuery.error.message
    : reportQuery.error
      ? 'تعذر تحميل بيانات التقارير'
      : null

  const handleGeneratePdf = async () => {
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) {
      window.alert('تعذر فتح معاينة PDF. يرجى السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى.')
      return
    }

    reportWindow.opener = null
    reportWindow.document.write('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><body style="font-family:Arial,Tahoma,sans-serif;padding:32px">جاري تحميل جميع نتائج التقرير...</body></html>')
    reportWindow.document.close()
    setIsGeneratingPdf(true)

    try {
      const completeReport = await getCompleteInventoryReport(filters)
      generateInventoryReportPdf(completeReport, filters, reportWindow)
    } catch (error) {
      reportWindow.close()
      window.alert(error instanceof Error ? error.message : 'تعذر إنشاء ملف PDF')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const handleGenerateExcel = async () => {
    setIsGeneratingExcel(true)
    try {
      const completeReport = await getCompleteInventoryReport(filters)
      generateInventoryReportExcel(completeReport, filters)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر إنشاء ملف Excel')
    } finally {
      setIsGeneratingExcel(false)
    }
  }

  return (
    <section dir="rtl" className="space-y-6" aria-busy={reportQuery.isPending || reportQuery.isFetching}>
      <header className="rounded-[28px] border border-[var(--app-border)] bg-white p-6 shadow-[var(--app-shadow)]">
        <h1 className="text-2xl font-bold text-slate-900">تقارير حركة المخزون</h1>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">
          ملخص تفصيلي لعمليات الإضافة والصرف خلال الفترة المحددة.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2 sm:col-span-2 xl:col-span-5">
            <span className="block text-sm font-semibold text-slate-700">بحث</span>
            <SearchInput value={searchInput} onValueChange={(value) => { setSearchInput(value); setCurrentPage(1) }} placeholder="ابحث باسم الصنف أو المخزن أو القسم أو رقم الكود" className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none transition focus:border-[var(--app-primary)]" />
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-semibold text-slate-700">من تاريخ</span>
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => { setFromDate(event.target.value); setCurrentPage(1) }} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none transition focus:border-[var(--app-primary)]" />
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-semibold text-slate-700">إلى تاريخ</span>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => { setToDate(event.target.value); setCurrentPage(1) }} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none transition focus:border-[var(--app-primary)]" />
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-semibold text-slate-700">المخزن</span>
            <select value={categoryName} onChange={(event) => { setCategoryName(event.target.value); setCurrentPage(1) }} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none transition focus:border-[var(--app-primary)]">
              <option value="">كل المخازن</option>
              {operationCategoryOptions.map((category) => <option key={category.key} value={category.label}>{category.label}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-semibold text-slate-700">القسم</span>
            <select value={projectName} onChange={(event) => { setProjectName(event.target.value); setCurrentPage(1) }} disabled={projectsQuery.isPending} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none transition focus:border-[var(--app-primary)] disabled:bg-slate-50 disabled:text-slate-500">
              <option value="">{projectsQuery.isPending ? 'جاري تحميل الأقسام...' : 'كل الأقسام'}</option>
              {(projectsQuery.data ?? []).map((project) => <option key={project.id} value={project.name}>{project.name}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-semibold text-slate-700">نوع العملية</span>
            <select value={operationType} onChange={(event) => { setOperationType(event.target.value as 'add' | 'issue' | 'both'); setCurrentPage(1) }} className="h-[44px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none transition focus:border-[var(--app-primary)]">
              <option value="both">الإضافة والصرف</option>
              <option value="add">إضافة</option>
              <option value="issue">صرف</option>
            </select>
          </label>
        </div>
        {(fromDate || toDate || categoryName || projectName || searchInput || operationType !== 'both') ? (
          <button type="button" onClick={() => { setFromDate(''); setToDate(''); setCategoryName(''); setProjectName(''); setOperationType('both'); setSearchInput(''); setSearchTerm(''); setCurrentPage(1) }} className="mt-4 text-sm font-bold text-[var(--app-primary)] hover:underline">
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

      <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-white shadow-[var(--app-shadow)]">
        <div className="flex flex-col gap-4 border-b border-[var(--app-border)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">ملخص الأصناف</h2>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">كل صف يمثل صنفًا واحدًا بإجمالي الإضافة والصرف ضمن الفترة المحددة.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {report ? <span className="text-sm text-slate-500">النتائج: {numberFormatter.format(report.totalItems)}</span> : null}
            <button type="button" disabled={!report || report.rows.length === 0 || reportQuery.isFetching || isGeneratingPdf} onClick={() => void handleGeneratePdf()} className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--app-primary)] px-4 text-sm font-bold text-white transition hover:bg-[var(--app-primary-strong)] disabled:cursor-not-allowed disabled:opacity-50">
              {isGeneratingPdf ? 'جاري إنشاء PDF...' : 'إنشاء PDF'}
            </button>
            <button type="button" disabled={!report || report.rows.length === 0 || reportQuery.isFetching || isGeneratingExcel} onClick={() => void handleGenerateExcel()} className="inline-flex h-10 items-center justify-center rounded-2xl border border-emerald-600 bg-white px-4 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">
              {isGeneratingExcel ? 'جاري إنشاء Excel...' : 'تصدير Excel'}
            </button>
          </div>
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
            <DataTable columns={columns} rows={report.rows} getRowKey={(row) => `${row.tableName}:${row.itemId}`} rowClassName="transition hover:bg-slate-50" onRowClick={(row) => {
              const category = operationCategoryOptions.find((option) => option.table === row.tableName)
              if (category) {
                navigate(getItemDetailsRoute(category.key, row.itemId, 'reports'), {
                  state: {
                    fromReports: true,
                    reportsReturnTo: `${location.pathname}${location.search}`,
                  },
                })
              }
            }} />
            <TablePagination currentPage={currentPage} pageSize={pageSize} totalItems={totalItems} totalPages={totalPages} pageStart={pageStart} pageEnd={pageEnd} onPageChange={setCurrentPage} onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setCurrentPage(1) }} />
          </>
        ) : null}
      </div>
    </section>
  )
}
