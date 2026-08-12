import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  dynamicCategoryItemsQueryOptions,
  dynamicCategoryQueryOptions,
} from '../features/dynamic-categories/dynamicCategoryQueries'

const arabicNumber = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 })
const arabicDate = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : arabicDate.format(date)
}

function queryErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'تعذر تحميل البيانات.'
}

export function DynamicCategoryItemsPage() {
  const { categoryId = '' } = useParams()
  const categoryQuery = useQuery(dynamicCategoryQueryOptions(categoryId))
  const itemsQuery = useQuery(dynamicCategoryItemsQueryOptions(categoryId))
  const category = categoryQuery.data
  const items = itemsQuery.data ?? []
  const isPending = categoryQuery.isPending || itemsQuery.isPending
  const error = categoryQuery.error ?? itemsQuery.error

  return (
    <section dir="rtl" className="space-y-6">
      <div className="rounded-[28px] border border-[var(--app-border)] bg-white p-6 shadow-[var(--app-shadow)] sm:p-8">
        <Link to="/dynamic-categories" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--app-primary)] hover:underline">
          <span aria-hidden="true">→</span>
          العودة إلى التصنيفات
        </Link>
        {category ? (
          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">{category.name}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${category.is_archived ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{category.is_archived ? 'مؤرشف' : 'نشط'}</span>
              </div>
              <p className="mt-2 text-sm text-slate-500">عرض أصناف التصنيف فقط — عمليات المخزون غير متاحة من هذه الصفحة.</p>
            </div>
            <div className="flex items-center gap-4 rounded-2xl bg-slate-50 px-5 py-3">
              <div><p className="text-xs text-slate-500">كود التصنيف</p><p dir="ltr" className="mt-1 font-mono text-sm font-black text-slate-800">{category.code_prefix}</p></div>
              <span className="h-9 w-px bg-slate-200" />
              <div><p className="text-xs text-slate-500">عدد الأصناف</p><p className="mt-1 text-sm font-black text-slate-800">{arabicNumber.format(category.item_count)}</p></div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-[28px] border border-[var(--app-border)] bg-white p-4 shadow-[var(--app-shadow)] sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div><h3 className="text-lg font-black text-slate-900">أصناف التصنيف</h3><p className="mt-1 text-sm text-slate-500">بيانات للعرض فقط ضمن مهمة إدارة التصنيفات.</p></div>
          {!isPending && !error ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{arabicNumber.format(items.length)} صنف</span> : null}
        </div>

        {isPending ? <div className="mt-6 space-y-3" aria-label="جاري تحميل الأصناف">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-slate-50" />)}</div> : null}

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-center text-sm text-red-700">
            {queryErrorMessage(error)}
          </div>
        ) : null}

        {!isPending && !error && items.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
            <p className="font-bold text-slate-800">لا توجد أصناف مرتبطة بهذا التصنيف بعد.</p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-[var(--app-border)] md:block">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600"><tr><th className="px-5 py-4">اسم الصنف</th><th className="px-5 py-4">الكود الداخلي</th><th className="px-5 py-4">الرصيد</th><th className="px-5 py-4">الحد الأدنى</th><th className="px-5 py-4">المورد</th><th className="px-5 py-4">تاريخ الإضافة</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => <tr key={item.id} className={item.is_archived ? 'bg-slate-50/70 text-slate-500' : ''}><td className="px-5 py-4 font-bold">{item.item_name || '—'}{item.is_archived ? <span className="mr-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold">مؤرشف</span> : null}</td><td dir="ltr" className="px-5 py-4 font-mono text-xs">{item.internal_code || '—'}</td><td className="px-5 py-4 font-semibold">{arabicNumber.format(Number(item.stock_balance ?? 0))}</td><td className="px-5 py-4">{arabicNumber.format(Number(item.min_quantity ?? 0))}</td><td className="px-5 py-4">{item.supplier_name || '—'}</td><td className="px-5 py-4">{formatDate(item.created_at)}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="mt-6 grid gap-4 md:hidden">
              {items.map((item) => <article key={item.id} className={`rounded-2xl border border-[var(--app-border)] p-4 ${item.is_archived ? 'bg-slate-50 text-slate-500' : ''}`}><div className="flex items-start justify-between gap-3"><h4 className="font-black text-slate-900">{item.item_name || '—'}</h4>{item.is_archived ? <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-bold">مؤرشف</span> : null}</div><p dir="ltr" className="mt-2 text-left font-mono text-xs text-slate-500">{item.internal_code || '—'}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">الرصيد</dt><dd className="mt-1 font-black">{arabicNumber.format(Number(item.stock_balance ?? 0))}</dd></div><div><dt className="text-xs text-slate-500">الحد الأدنى</dt><dd className="mt-1 font-bold">{arabicNumber.format(Number(item.min_quantity ?? 0))}</dd></div><div><dt className="text-xs text-slate-500">المورد</dt><dd className="mt-1 font-semibold">{item.supplier_name || '—'}</dd></div><div><dt className="text-xs text-slate-500">تاريخ الإضافة</dt><dd className="mt-1 font-semibold">{formatDate(item.created_at)}</dd></div></dl></article>)}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
