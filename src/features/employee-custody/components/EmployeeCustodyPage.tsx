import { useState } from 'react'
import type { Employee } from '../../../services/partiesService'
import { useEmployeeCustody } from '../hooks/useEmployeeCustody'
import type { CustodyFilter, EmployeeCustodyRecord } from '../types'
import { AddEmployeeCustodyModal } from './AddEmployeeCustodyModal'
import { EmployeeCustodyList } from './EmployeeCustodyList'
import { ScrapCustodyModal } from './ScrapCustodyModal'

export function EmployeeCustodyPage({
  employee,
  onClose,
}: {
  employee: Employee
  onClose: () => void
}) {
  const query = useEmployeeCustody(employee.id)
  const [addOpen, setAddOpen] = useState(false)
  const [scrapping, setScrapping] = useState<EmployeeCustodyRecord | null>(null)
  const [filter, setFilter] = useState<CustodyFilter>('all')
  const records = query.data ?? []
  const activeCount = records.filter((record) => !record.scrappedDate).length
  const scrappedCount = records.length - activeCount
  const filteredRecords = records.filter((record) =>
    filter === 'all' || (filter === 'active' ? !record.scrappedDate : Boolean(record.scrappedDate)),
  )

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/55 p-3 sm:p-5" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="employee-custody-title">
      <div className="mx-auto my-2 min-h-[calc(100vh-2rem)] w-full max-w-7xl rounded-[28px] bg-white p-4 shadow-2xl sm:my-5 sm:min-h-0 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="employee-custody-title" className="text-2xl font-bold text-slate-900">عهدة {employee.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {[employee.employee_code, employee.department].filter(Boolean).join(' • ') || 'بيانات عهدة الموظف'}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAddOpen(true)} className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white hover:bg-blue-700 sm:flex-none">+ تحديد عهدة</button>
            <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2.5 text-slate-700 hover:bg-slate-200">رجوع</button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
            <div className="text-xs font-bold text-emerald-700">عدد العهد النشطة</div>
            <div className="mt-1 text-2xl font-bold text-emerald-900">{activeCount}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-xs font-bold text-slate-600">عدد العهد المكهنة</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{scrappedCount}</div>
          </div>
        </div>

        <div className="mt-5 flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 sm:w-fit">
          {([
            ['all', 'الكل'],
            ['active', 'العهد النشطة'],
            ['scrapped', 'المكهن'],
          ] as Array<[CustodyFilter, string]>).map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setFilter(value)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${filter === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {query.isPending ? (
            <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
          ) : query.isError ? (
            <div className="rounded-2xl bg-red-50 p-6 text-center text-red-700">
              <p>{query.error.message}</p>
              <button type="button" onClick={() => void query.refetch()} className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-bold shadow-sm">إعادة المحاولة</button>
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-sm">⌂</div>
              <h3 className="mt-4 font-bold text-slate-900">لا توجد عهد مسجلة لهذا الموظف</h3>
              <p className="mt-1 text-sm text-slate-500">حركات الصرف السابقة لا تُضاف إلى العهدة تلقائيًا.</p>
              <button type="button" onClick={() => setAddOpen(true)} className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white">تحديد عهدة</button>
            </div>
          ) : filteredRecords.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">لا توجد عهد ضمن هذا الفلتر</p>
          ) : (
            <EmployeeCustodyList rows={filteredRecords} onScrap={setScrapping} />
          )}
        </div>
      </div>

      {addOpen ? <AddEmployeeCustodyModal employeeId={employee.id} onClose={() => setAddOpen(false)} /> : null}
      {scrapping ? <ScrapCustodyModal employeeId={employee.id} custody={scrapping} onClose={() => setScrapping(null)} /> : null}
    </div>
  )
}
