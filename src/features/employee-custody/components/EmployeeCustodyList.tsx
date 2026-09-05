import type { EmployeeCustodyRecord } from '../types'

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(value))
    : '—'
}

function itemDescription(custody: EmployeeCustodyRecord) {
  const item = custody.itemDetails
  if (custody.tableName === 'raw_materials') {
    const explicitDimensions = String(item.dimension_text ?? '').trim()
    const dimensions = explicitDimensions || [item.length, item.width, item.th]
      .filter((value) => value != null && value !== '')
      .join(' × ')
    return [
      item.code_number && `رقم الكود: ${String(item.code_number)}`,
      dimensions && `الأبعاد: ${dimensions}`,
      item.weight != null && item.weight !== '' && `الوزن: ${String(item.weight)}`,
    ].filter(Boolean).join(' • ')
  }
  if (custody.tableName === 'cylinders') return 'نوع اسطوانة'
  return custody.projectName ? `المشروع/القسم: ${custody.projectName}` : ''
}

function StatusBadge({ scrapped }: { scrapped: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
      scrapped
        ? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
        : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
    }`}>
      {scrapped ? 'مكهن' : 'عهدة فعالة'}
    </span>
  )
}

export function EmployeeCustodyList({
  rows,
  onScrap,
}: {
  rows: EmployeeCustodyRecord[]
  onScrap: (custody: EmployeeCustodyRecord) => void
}) {
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {rows.map((custody) => {
          const scrapped = Boolean(custody.scrappedDate)
          const description = itemDescription(custody)
          return (
            <article key={custody.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900">{custody.itemName}</h3>
                  <p className="mt-1 text-xs text-slate-500">{[custody.itemCode, custody.categoryName].filter(Boolean).join(' • ') || '—'}</p>
                </div>
                <StatusBadge scrapped={scrapped} />
              </div>
              {description ? <p className="mt-2 text-xs text-slate-500">{description}</p> : null}
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-slate-500">الكمية</dt><dd className="mt-0.5 font-bold">{custody.quantity}</dd></div>
                <div><dt className="text-xs text-slate-500">تاريخ الاستلام</dt><dd className="mt-0.5 font-bold">{formatDate(custody.receivedDate)}</dd></div>
                <div><dt className="text-xs text-slate-500">مصدر العهدة</dt><dd className="mt-0.5 font-bold">{custody.sourceIssueOperationId ? 'من حركة صرف' : 'تسجيل يدوي'}</dd></div>
                {scrapped ? <div><dt className="text-xs text-slate-500">تاريخ التكهين</dt><dd className="mt-0.5 font-bold">{formatDate(custody.scrappedDate)}</dd></div> : null}
              </dl>
              {custody.notes ? <p className="mt-3 rounded-xl bg-slate-50 p-2 text-xs text-slate-600">ملاحظات: {custody.notes}</p> : null}
              {custody.scrapReason ? <p className="mt-3 rounded-xl bg-amber-50 p-2 text-xs text-amber-800">سبب التكهين: {custody.scrapReason}</p> : null}
              {!scrapped ? (
                <button type="button" onClick={() => onScrap(custody)} className="mt-4 w-full rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700 hover:bg-amber-100">تكهين</button>
              ) : null}
            </article>
          )
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {['الصنف', 'الكود', 'التصنيف', 'الكمية', 'تاريخ الاستلام', 'مصدر العهدة', 'الحالة', 'تاريخ التكهين', 'سبب التكهين', 'إجراءات'].map((heading) => (
                <th key={heading} className="border-b border-slate-200 px-4 py-3 text-right text-xs font-bold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((custody) => {
              const scrapped = Boolean(custody.scrappedDate)
              const description = itemDescription(custody)
              return (
                <tr key={custody.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{custody.itemName}</div>
                    {description ? <div className="mt-1 max-w-72 text-xs text-slate-500">{description}</div> : null}
                    {custody.notes ? <div className="mt-1 max-w-72 text-xs text-slate-500">{custody.notes}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{custody.itemCode ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{custody.categoryName ?? '—'}</td>
                  <td className="px-4 py-3 font-bold">{custody.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(custody.receivedDate)}</td>
                  <td className="px-4 py-3">{custody.sourceIssueOperationId ? 'من حركة صرف' : 'تسجيل يدوي'}</td>
                  <td className="px-4 py-3"><StatusBadge scrapped={scrapped} /></td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(custody.scrappedDate)}</td>
                  <td className="max-w-64 px-4 py-3 text-slate-600">{custody.scrapReason ?? '—'}</td>
                  <td className="px-4 py-3">
                    {!scrapped ? (
                      <button type="button" onClick={() => onScrap(custody)} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100">تكهين</button>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
