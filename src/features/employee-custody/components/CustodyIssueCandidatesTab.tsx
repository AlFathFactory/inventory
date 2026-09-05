import { useMemo, useState } from 'react'
import { useEmployeeCustodyIssueCandidates } from '../hooks/useEmployeeCustodyIssueCandidates'
import type { CustodyIssueCandidate } from '../types'
import { matchesAnySearchValue, normalizeSearchTerm } from '../../../utils/searchUtils'

function formatDate(value: string) {
  return value
    ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(value))
    : '—'
}

export function CustodyIssueCandidatesTab({
  employeeId,
  selected,
  onSelect,
}: {
  employeeId: string
  selected: CustodyIssueCandidate | null
  onSelect: (candidate: CustodyIssueCandidate) => void
}) {
  const [search, setSearch] = useState('')
  const query = useEmployeeCustodyIssueCandidates(employeeId)
  const normalizedSearch = normalizeSearchTerm(search)
  const rows = useMemo(
    () => (query.data ?? []).filter((candidate) => matchesAnySearchValue([
      candidate.itemName,
      candidate.itemCode,
      candidate.categoryName,
      candidate.projectName,
    ], normalizedSearch)),
    [normalizedSearch, query.data],
  )

  return (
    <div>
      <label className="block text-sm font-bold text-slate-700" htmlFor="custody-issue-search">
        بحث في حركات الصرف
      </label>
      <input
        id="custody-issue-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="اسم الصنف أو الكود أو التصنيف أو المشروع"
        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
      />

      {query.isPending ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((value) => <div key={value} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : query.isError ? (
        <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{query.error.message}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">
          {search ? 'لا توجد حركات صرف مطابقة للبحث' : 'لا توجد حركات صرف متاحة لتحديدها كعهدة'}
        </p>
      ) : (
        <div className="mt-4 max-h-[42vh] space-y-3 overflow-y-auto pe-1" role="radiogroup" aria-label="حركات الصرف المتاحة">
          {rows.map((candidate) => {
            const isSelected = selected?.operationId === candidate.operationId
            return (
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                key={candidate.operationId}
                onClick={() => onSelect(candidate)}
                className={`w-full rounded-2xl border p-4 text-right transition ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                    : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900">{candidate.itemName}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {[candidate.itemCode, candidate.categoryName, candidate.projectName].filter(Boolean).join(' • ') || 'لا توجد تفاصيل إضافية'}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    الكمية: {candidate.quantity}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                  <span>تاريخ الصرف: <strong>{formatDate(candidate.operationDate)}</strong></span>
                  <span>المرتجع: <strong>{candidate.returnedQuantity}</strong></span>
                  {candidate.returnStatus ? <span>الحالة: <strong>{candidate.returnStatus}</strong></span> : null}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">
          تاريخ الاستلام مأخوذ من حركة الصرف: <strong>{formatDate(selected.operationDate)}</strong>
        </p>
      ) : null}
    </div>
  )
}
