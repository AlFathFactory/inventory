import { useDeferredValue, useMemo, useState } from 'react'
import { usePagination } from '../../hooks/usePagination'
import { getSupabaseConfigError, isSupabaseConfigured } from '../../lib/supabaseClient'
import { LowStockFilters } from './components/LowStockFilters'
import { LowStockSummary } from './components/LowStockSummary'
import { LowStockTable } from './components/LowStockTable'
import { useLowStockAlerts } from './hooks/useLowStockAlerts'
import type { AlertStatusFilter } from './types'
import { generateLowStockReport } from './utils/lowStockReport'

function getInclusiveDateEndTimestamp(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return year && month && day ? new Date(year, month - 1, day, 23, 59, 59, 999).getTime() : null
}

export function LowStockPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [dateRange, setDateRange] = useState({ fromDate: '', toDate: '' })
  const state = useLowStockAlerts()
  const configError = !isSupabaseConfigured ? getSupabaseConfigError() : null
  const normalizedSearchTerm = useDeferredValue(searchTerm).trim().toLowerCase()
  const projectOptions = useMemo(() => Array.from(new Set(state.rows.map((row) => row.projectName).filter((name): name is string => Boolean(name)))).sort((a, b) => a.localeCompare(b, 'ar')), [state.rows])
  const searchedRows = useMemo(() => state.rows.filter((row) => !normalizedSearchTerm || row.searchText.includes(normalizedSearchTerm)), [normalizedSearchTerm, state.rows])
  const filteredRows = useMemo(() => {
    const fromTimestamp = dateRange.fromDate ? new Date(dateRange.fromDate).getTime() : null
    const toTimestamp = dateRange.toDate ? getInclusiveDateEndTimestamp(dateRange.toDate) : null
    return searchedRows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (projectFilter !== 'all' && row.projectName !== projectFilter) return false
      if (categoryFilter !== 'all' && row.categoryKey !== categoryFilter) return false
      if (fromTimestamp === null && toTimestamp === null) return true
      const timestamp = row.dateValue ? new Date(row.dateValue).getTime() : 0
      return Boolean(timestamp) && (fromTimestamp === null || timestamp >= fromTimestamp) && (toTimestamp === null || timestamp <= toTimestamp)
    })
  }, [categoryFilter, dateRange, projectFilter, searchedRows, statusFilter])
  const pagination = usePagination(filteredRows, { initialPageSize: 10 })
  const counts = useMemo(() => ({ outOfStock: searchedRows.filter((row) => row.status === 'out').length, lowStock: searchedRows.filter((row) => row.status === 'low').length, expired: searchedRows.filter((row) => row.status === 'expired').length, expiring: searchedRows.filter((row) => row.status === 'expiring').length }), [searchedRows])
  const hasPaintRows = filteredRows.some((row) => row.categoryKey === 'paints')
  return <section className="space-y-6">{configError ? <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">Supabase is not configured for this deployment. {configError}</div> : null}{state.error ? <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{state.error}</div> : null}<LowStockSummary total={filteredRows.length} {...counts} /><div className="space-y-4 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] p-4 shadow-[var(--app-shadow)] md:p-6"><div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-semibold text-slate-900">الأصناف التي تحتاج متابعة</p><p className="text-sm text-[var(--app-text-muted)]">الجدول يجمع تنبيهات الكمية وتنبيهات صلاحية الدهانات في مكان واحد.</p></div><div className="flex items-center gap-3"><p className="text-sm text-slate-500">النتائج: {filteredRows.length}</p><button type="button" onClick={() => generateLowStockReport(filteredRows, hasPaintRows)} disabled={filteredRows.length === 0} className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--app-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--app-primary-strong)] disabled:cursor-not-allowed disabled:opacity-50">إنشاء تقرير</button></div></div><LowStockFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} dateRange={dateRange} onDateRangeChange={setDateRange} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} projectFilter={projectFilter} onProjectFilterChange={setProjectFilter} categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} projectOptions={projectOptions} /><LowStockTable rows={filteredRows} isLoading={state.isLoading} pagination={pagination} /></div></section>
}
