import type { RawMaterialProjectHistoryTotal } from '../../../services/rawMaterialsService'

type RawMaterialProjectHistorySectionProps = {
  rows: RawMaterialProjectHistoryTotal[]
  isLoading: boolean
  error: string | null
}

export function RawMaterialProjectHistorySection({
  rows,
  isLoading,
  error,
}: RawMaterialProjectHistorySectionProps) {
  return (
    <section className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-5 shadow-sm lg:p-6">
      <div className="text-right">
        <h3 className="text-xl font-bold text-slate-900">الصرف التاريخي للمشروعات</h3>
        <p className="mt-1 text-sm text-slate-600">
          الصرف التاريخي قبل تشغيل النظام — للعرض فقط ولا يؤثر على الرصيد الحالي.
        </p>
      </div>

      {isLoading ? (
        <div className="mt-5 rounded-2xl bg-white/80 px-4 py-6 text-center text-sm text-slate-500">
          جاري تحميل بيانات الصرف التاريخي...
        </div>
      ) : error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-5 rounded-2xl bg-white/80 px-4 py-6 text-center text-sm text-slate-500">
          لا يوجد صرف تاريخي مسجل لهذه الخامة.
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.projectId}
              className="flex items-center justify-between gap-4 rounded-2xl border border-amber-100 bg-white px-4 py-3"
            >
              <span className="font-semibold text-slate-800">{row.projectName}</span>
              <span className="rounded-xl bg-amber-100 px-3 py-1 font-bold text-amber-900">
                {row.quantity.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
