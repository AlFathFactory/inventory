import { useMemo, useState } from 'react'

type CodeMeaning = {
  code: string
  meaning: string
}

const examples: CodeMeaning[] = [
  { code: 'RM-KH-001', meaning: 'خامات - خامات - صنف رقم 1' },
  { code: 'RM-GF-001', meaning: 'خامات - جريتن مجلفن - صنف رقم 1' },
  { code: 'RM-KF-001', meaning: 'خامات - خامات الفتح - صنف رقم 1' },
  { code: 'SC-ET-001', meaning: 'مسامير - ETALIA - صنف رقم 1' },
  { code: 'SS-RO-001', meaning: 'مسامير استوك - ROTT - صنف رقم 1' },
  { code: 'CO-SN-001', meaning: 'مستهلكات - صيانة - صنف رقم 1' },
  { code: 'CO-BL-001', meaning: 'مستهلكات - جرد البلى - صنف رقم 1' },
  { code: 'PA-GN-001', meaning: 'دهانات - عام - صنف رقم 1' },
]

const departmentCodes: CodeMeaning[] = [
  { code: 'CO', meaning: 'مستهلكات' },
  { code: 'PA', meaning: 'دهانات' },
  { code: 'SC', meaning: 'مسامير' },
  { code: 'SS', meaning: 'مسامير استوك' },
  { code: 'RM', meaning: 'خامات' },
  { code: 'CY', meaning: 'اسطوانات' },
  { code: 'CD', meaning: 'صواريخ' },
  { code: 'WG', meaning: 'جوانتي لحام طويل' },
]

const sourceGroups = [
  {
    title: 'الخامات',
    rows: [
      { code: 'KH', meaning: 'خامات' },
      { code: 'KF', meaning: 'خامات الفتح' },
      { code: 'GF', meaning: 'جريتن مجلفن' },
    ],
  },
  {
    title: 'المسامير',
    rows: [
      { code: 'ET', meaning: 'ETALIA' },
      { code: 'RO', meaning: 'ROTT' },
      { code: 'RT', meaning: 'RTG' },
      { code: 'GN', meaning: 'عام / غير محدد' },
    ],
  },
  {
    title: 'المستهلكات',
    rows: [
      { code: 'SN', meaning: 'صيانة' },
      { code: 'TG', meaning: 'تجهيز' },
      { code: 'LH', meaning: 'لحام' },
      { code: 'BR', meaning: 'برادة' },
      { code: 'DH', meaning: 'دهانات' },
      { code: 'SH', meaning: 'شحن' },
      { code: 'SF', meaning: 'سفتي' },
      { code: 'MZ', meaning: 'مخزن' },
      { code: 'QA', meaning: 'جودة' },
      { code: 'BL', meaning: 'جرد البلى' },
      { code: 'GN', meaning: 'عام / غير محدد' },
    ],
  },
] satisfies Array<{ title: string; rows: CodeMeaning[] }>

function matchesSearch(row: CodeMeaning, searchValue: string) {
  return `${row.code} ${row.meaning}`.toLowerCase().includes(searchValue)
}

function CodeBadge({ children, tone = 'blue' }: { children: string; tone?: 'blue' | 'emerald' | 'violet' }) {
  const toneClassName = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  }[tone]

  return (
    <span dir="ltr" className={`inline-flex min-w-14 select-all items-center justify-center rounded-xl border px-3 py-2 font-mono text-base font-bold ${toneClassName}`}>
      {children}
    </span>
  )
}

function CodeMeaningTable({ rows }: { rows: CodeMeaning[] }) {
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-slate-500">لا توجد نتائج مطابقة للبحث.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-right text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-5 py-3 font-semibold">الكود</th>
            <th className="px-5 py-3 font-semibold">المعنى</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={`${row.code}-${row.meaning}`} className="hover:bg-slate-50/70">
              <td className="px-5 py-3">
                <span dir="ltr" className="inline-block select-all rounded-lg bg-blue-50 px-2.5 py-1 font-mono font-bold text-blue-700">
                  {row.code}
                </span>
              </td>
              <td className="px-5 py-3 font-medium text-slate-700">{row.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ItemCodeGuidePage() {
  const [search, setSearch] = useState('')
  const searchValue = search.trim().toLowerCase()
  const filteredExamples = useMemo(
    () => examples.filter((row) => matchesSearch(row, searchValue)),
    [searchValue],
  )
  const filteredDepartments = useMemo(
    () => departmentCodes.filter((row) => matchesSearch(row, searchValue)),
    [searchValue],
  )
  const filteredSourceGroups = useMemo(
    () => sourceGroups.map((group) => ({
      ...group,
      rows: group.rows.filter((row) =>
        group.title.toLowerCase().includes(searchValue) || matchesSearch(row, searchValue),
      ),
    })),
    [searchValue],
  )

  return (
    <section dir="rtl" className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-[28px] border border-[var(--app-border)] bg-white p-6 shadow-[var(--app-shadow)] lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-950">دليل أكواد الأصناف</h2>
            <p className="mt-2 text-base text-[var(--app-text-muted)]">
              افهم معنى كود الصنف بسرعة وابحث عنه بسهولة داخل المخزن.
            </p>
          </div>
          <label className="block w-full lg:max-w-md">
            <span className="mb-2 block text-sm font-semibold text-slate-700">ابحث في معاني الأكواد</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="مثال: RM أو خامات أو صيانة"
              className="h-12 w-full rounded-2xl border border-[var(--app-border)] bg-slate-50 px-4 text-sm text-slate-800 outline-none transition focus:border-[var(--app-primary)] focus:bg-white"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[28px] border border-[var(--app-border)] bg-white p-6 shadow-[var(--app-shadow)]">
          <h3 className="text-xl font-bold text-slate-900">الكود معناه إيه؟</h3>
          <p className="mt-3 leading-8 text-slate-700">
            كود الصنف هو كود داخلي بسيط بيساعدك توصل لأي صنف بسرعة.
          </p>
          <p className="mt-2 font-semibold text-slate-800">الكود بيتكون من 3 أجزاء:</p>
          <p className="mt-2 text-slate-600">القسم - المشروع أو المصدر - رقم الصنف</p>

          <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50/50 p-5">
            <div dir="ltr" className="flex flex-wrap items-center justify-center gap-2">
              <CodeBadge tone="blue">RM</CodeBadge>
              <span className="font-bold text-slate-400">-</span>
              <CodeBadge tone="emerald">GF</CodeBadge>
              <span className="font-bold text-slate-400">-</span>
              <CodeBadge tone="violet">001</CodeBadge>
            </div>
            <div className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
              <p><strong dir="ltr">RM</strong> = خامات</p>
              <p><strong dir="ltr">GF</strong> = جريتن مجلفن</p>
              <p><strong dir="ltr">001</strong> = رقم الصنف داخل المجموعة</p>
            </div>
            <p className="mt-5 rounded-2xl bg-white px-4 py-3 text-center font-bold text-slate-800">
              المعنى: خامات - جريتن مجلفن - صنف رقم 1
            </p>
          </div>
        </article>

        <aside className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-[var(--app-shadow)]">
          <h3 className="text-xl font-bold text-amber-950">مهم: الكودان مختلفان</h3>
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-white p-4">
              <code dir="ltr" className="font-bold text-blue-700">internal_code</code>
              <p className="mt-1 text-sm font-semibold text-slate-800">كود الصنف الداخلي</p>
              <p className="mt-1 text-sm text-slate-600">هو الكود البسيط المستخدم للبحث داخل المخزن.</p>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <code dir="ltr" className="font-bold text-slate-700">code_number</code>
              <p className="mt-1 text-sm font-semibold text-slate-800">كود المورد أو الكود القديم من Excel</p>
              <p className="mt-1 text-sm text-slate-600">ليس هو كود الصنف الداخلي.</p>
            </div>
          </div>
        </aside>
      </div>

      <GuideSection title="أمثلة سريعة">
        <CodeMeaningTable rows={filteredExamples} />
      </GuideSection>

      <GuideSection title="معاني كود القسم">
        <CodeMeaningTable rows={filteredDepartments} />
      </GuideSection>

      <div>
        <h3 className="mb-4 text-2xl font-bold text-slate-900">معاني كود المصدر أو المشروع</h3>
        <div className="grid gap-5 lg:grid-cols-3">
          {filteredSourceGroups.map((group) => (
            <GuideSection key={group.title} title={group.title} compact>
              <CodeMeaningTable rows={group.rows} />
            </GuideSection>
          ))}
        </div>
      </div>
    </section>
  )
}

function GuideSection({ title, children, compact = false }: { title: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <article className={`overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-white shadow-[var(--app-shadow)] ${compact ? '' : 'w-full'}`}>
      <div className="border-b border-[var(--app-border)] px-5 py-4">
        <h3 className="text-xl font-bold text-slate-900">{title}</h3>
      </div>
      {children}
    </article>
  )
}
