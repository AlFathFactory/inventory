import { useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { SearchInput } from '../components/SearchInput'
import { useToast } from '../components/ToastProvider'
import {
  dynamicCategoriesQueryOptions,
  useCreateDynamicCategory,
  useRenameDynamicCategory,
  useSetDynamicCategoryArchived,
} from '../features/dynamic-categories/dynamicCategoryQueries'
import {
  normalizeDynamicCategoryName,
  validateDynamicCategoryName,
} from '../features/dynamic-categories/dynamicCategoryService'
import { getDynamicCategoryItemsRoute } from '../features/dynamic-categories/dynamicCategoryRoutes'
import type { DynamicCategory } from '../features/dynamic-categories/types'

type StatusFilter = 'active' | 'archived' | 'all'
type CategoryDialogState = { mode: 'create' } | { mode: 'rename'; category: DynamicCategory }

const arabicNumber = new Intl.NumberFormat('ar-EG')
const arabicDate = new Intl.DateTimeFormat('ar-EG', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : arabicDate.format(date)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع.'
}

export function DynamicCategoriesPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const categoriesQuery = useQuery(dynamicCategoriesQueryOptions)
  const createMutation = useCreateDynamicCategory()
  const renameMutation = useRenameDynamicCategory()
  const archiveMutation = useSetDynamicCategoryArchived()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [searchTerm, setSearchTerm] = useState('')
  const [dialog, setDialog] = useState<CategoryDialogState | null>(null)
  const [name, setName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const activeCount = categories.filter((category) => !category.is_archived).length
  const archivedCount = categories.length - activeCount
  const itemCount = categories.reduce((total, category) => total + category.item_count, 0)

  const filteredCategories = useMemo(() => {
    const normalizedSearch = normalizeDynamicCategoryName(searchTerm).toLocaleLowerCase('ar')

    return categories.filter((category) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && !category.is_archived) ||
        (statusFilter === 'archived' && category.is_archived)
      const matchesSearch =
        !normalizedSearch ||
        category.name.toLocaleLowerCase('ar').includes(normalizedSearch) ||
        category.code_prefix.toLocaleLowerCase('en').includes(normalizedSearch)

      return matchesStatus && matchesSearch
    })
  }, [categories, searchTerm, statusFilter])

  function openCreateDialog() {
    createMutation.reset()
    setDialog({ mode: 'create' })
    setName('')
    setFormError(null)
  }

  function openRenameDialog(category: DynamicCategory) {
    renameMutation.reset()
    setDialog({ mode: 'rename', category })
    setName(category.name)
    setFormError(null)
  }

  function closeDialog() {
    if (createMutation.isPending || renameMutation.isPending) return
    setDialog(null)
    setFormError(null)
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validateDynamicCategoryName(name)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setFormError(null)
    try {
      if (dialog?.mode === 'rename') {
        await renameMutation.mutateAsync({ categoryId: dialog.category.id, name })
        showToast('تم تغيير اسم القسم مع الحفاظ على الكود كما هو.')
      } else {
        await createMutation.mutateAsync(name)
        showToast('تم إنشاء القسم وإسناد الكود له بنجاح.')
      }
      setDialog(null)
      setName('')
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  async function toggleArchive(category: DynamicCategory) {
    const nextArchived = !category.is_archived
    if (
      nextArchived &&
      !window.confirm(
        `هل تريد أرشفة القسم «${category.name}»؟ سيختفي من قائمة الأقسام النشطة دون حذف بياناته.`,
      )
    ) {
      return
    }

    try {
      await archiveMutation.mutateAsync({
        categoryId: category.id,
        isArchived: nextArchived,
      })
      showToast(nextArchived ? 'تمت أرشفة القسم.' : 'تمت إعادة تنشيط القسم.')
    } catch (error) {
      showToast(errorMessage(error), 'error')
    }
  }

  const isSaving = createMutation.isPending || renameMutation.isPending

  return (
    <section dir="rtl" className="space-y-6">
      <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-white shadow-[var(--app-shadow)]">
        <div className="flex flex-col gap-6 bg-gradient-to-l from-[#eef4ff] via-white to-white p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
              أقسام مرنة
            </span>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              إدارة الأقسام
            </h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              أنشئ أقسامًا جديدة وأدر حالتها من مكان واحد. الأكواد تُنشأ تلقائيًا من النظام
              وتظل ثابتة عند تغيير الاسم.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateDialog}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--app-primary)] px-5 text-sm font-bold text-white shadow-lg shadow-blue-900/10 transition hover:-translate-y-0.5 hover:bg-[var(--app-primary-strong)]"
          >
            <span className="text-xl leading-none">+</span>
            إضافة قسم
          </button>
        </div>

        <div className="grid border-t border-[var(--app-border)] sm:grid-cols-3">
          <SummaryMetric label="الأقسام النشطة" value={activeCount} tone="blue" />
          <SummaryMetric label="الأقسام المؤرشفة" value={archivedCount} tone="slate" />
          <SummaryMetric label="إجمالي الأصناف المرتبطة" value={itemCount} tone="emerald" />
        </div>
      </div>

      <div className="rounded-[28px] border border-[var(--app-border)] bg-white p-4 shadow-[var(--app-shadow)] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <label className="block flex-1 space-y-2 xl:max-w-xl">
            <span className="text-sm font-bold text-slate-700">البحث في الأقسام</span>
            <SearchInput
              value={searchTerm}
              onValueChange={setSearchTerm}
              placeholder="ابحث بالاسم أو كود DC..."
              className="h-12 w-full rounded-2xl border border-[var(--app-border)] bg-slate-50/70 px-4 text-sm outline-none transition focus:border-[var(--app-primary)] focus:bg-white focus:ring-4 focus:ring-blue-50"
            />
          </label>
          <div className="flex rounded-2xl bg-slate-100 p-1" aria-label="تصفية حالة الأقسام">
            <FilterButton active={statusFilter === 'active'} onClick={() => setStatusFilter('active')}>
              النشطة
            </FilterButton>
            <FilterButton active={statusFilter === 'archived'} onClick={() => setStatusFilter('archived')}>
              المؤرشفة
            </FilterButton>
            <FilterButton active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
              الكل
            </FilterButton>
          </div>
        </div>

        {categoriesQuery.isPending ? <CategoriesLoading /> : null}

        {categoriesQuery.isError ? (
          <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-5 py-8 text-center">
            <p className="font-bold text-red-800">تعذر تحميل الأقسام</p>
            <p className="mt-2 text-sm text-red-700">{errorMessage(categoriesQuery.error)}</p>
            <button
              type="button"
              onClick={() => void categoriesQuery.refetch()}
              className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : null}

        {!categoriesQuery.isPending && !categoriesQuery.isError && filteredCategories.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
              ◫
            </div>
            <h3 className="mt-4 font-bold text-slate-900">
              {categories.length === 0 ? 'لا توجد أقسام بعد' : 'لا توجد نتائج مطابقة'}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {categories.length === 0
                ? 'ابدأ بإضافة أول قسم، وسيُنشئ النظام كود DC تلقائيًا.'
                : 'جرّب تغيير البحث أو حالة القسم.'}
            </p>
            {categories.length === 0 ? (
              <button
                type="button"
                onClick={openCreateDialog}
                className="mt-5 rounded-xl bg-[var(--app-primary)] px-4 py-2 text-sm font-bold text-white"
              >
                إضافة أول قسم
              </button>
            ) : null}
          </div>
        ) : null}

        {filteredCategories.length > 0 ? (
          <>
            <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-[var(--app-border)] md:block">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr>
                    <th className="px-5 py-4">اسم القسم</th>
                    <th className="px-5 py-4">كود القسم</th>
                    <th className="px-5 py-4">عدد الأصناف</th>
                    <th className="px-5 py-4">الحالة</th>
                    <th className="px-5 py-4">تاريخ الإنشاء</th>
                    <th className="px-5 py-4">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCategories.map((category) => (
                    <tr
                      key={category.id}
                      onClick={() => navigate(getDynamicCategoryItemsRoute(category.id))}
                      className="cursor-pointer transition hover:bg-blue-50/40"
                    >
                      <td className="px-5 py-4 font-bold text-slate-900">{category.name}</td>
                      <td className="px-5 py-4">
                        <CodeBadge value={category.code_prefix} />
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-700">
                        {arabicNumber.format(category.item_count)}
                      </td>
                      <td className="px-5 py-4"><StatusBadge archived={category.is_archived} /></td>
                      <td className="px-5 py-4 text-slate-600">{formatDate(category.created_at)}</td>
                      <td className="px-5 py-4">
                        <CategoryActions
                          category={category}
                          pending={archiveMutation.isPending}
                          onRename={openRenameDialog}
                          onToggleArchive={(selected) => void toggleArchive(selected)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid gap-4 md:hidden">
              {filteredCategories.map((category) => (
                <article
                  key={category.id}
                  onClick={() => navigate(getDynamicCategoryItemsRoute(category.id))}
                  className="cursor-pointer rounded-3xl border border-[var(--app-border)] p-5 transition active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-black text-slate-900">{category.name}</h3>
                      <div className="mt-2"><CodeBadge value={category.code_prefix} /></div>
                    </div>
                    <StatusBadge archived={category.is_archived} />
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
                    <div><dt className="text-xs text-slate-500">عدد الأصناف</dt><dd className="mt-1 font-black text-slate-900">{arabicNumber.format(category.item_count)}</dd></div>
                    <div><dt className="text-xs text-slate-500">تاريخ الإنشاء</dt><dd className="mt-1 font-semibold text-slate-700">{formatDate(category.created_at)}</dd></div>
                  </dl>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <CategoryActions
                      category={category}
                      pending={archiveMutation.isPending}
                      onRename={openRenameDialog}
                      onToggleArchive={(selected) => void toggleArchive(selected)}
                    />
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {dialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog()
          }}
        >
          <form
            onSubmit={(event) => void submitCategory(event)}
            className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl sm:p-7"
            aria-labelledby="dynamic-category-dialog-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="dynamic-category-dialog-title" className="text-xl font-black text-slate-950">
                  {dialog.mode === 'create' ? 'إضافة قسم جديد' : 'تغيير اسم القسم'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {dialog.mode === 'create'
                    ? 'اكتب الاسم بالعربية أو بأي لغة، وسيُنشئ النظام كود DC تلقائيًا.'
                    : 'سيبقى كود القسم والأكواد الداخلية للأصناف دون تغيير.'}
                </p>
              </div>
              <button type="button" onClick={closeDialog} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600" aria-label="إغلاق">×</button>
            </div>

            {dialog.mode === 'rename' ? (
              <div className="mt-5 flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm">
                <span className="font-semibold text-blue-800">الكود الثابت</span>
                <CodeBadge value={dialog.category.code_prefix} />
              </div>
            ) : null}

            <label className="mt-5 block space-y-2">
              <span className="text-sm font-bold text-slate-700">اسم القسم *</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  if (formError) setFormError(null)
                }}
                placeholder="مثال: مواد التعبئة والتغليف"
                className="h-12 w-full rounded-2xl border border-[var(--app-border)] px-4 text-sm outline-none transition focus:border-[var(--app-primary)] focus:ring-4 focus:ring-blue-50"
              />
            </label>

            {formError ? (
              <p role="alert" className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {formError}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeDialog} disabled={isSaving} className="h-11 rounded-2xl px-5 text-sm font-bold text-slate-600 disabled:opacity-50">إلغاء</button>
              <button type="submit" disabled={isSaving} className="h-11 rounded-2xl bg-[var(--app-primary)] px-6 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {isSaving ? 'جاري الحفظ...' : dialog.mode === 'create' ? 'إنشاء القسم' : 'حفظ الاسم'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  )
}

function SummaryMetric({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'slate' | 'emerald' }) {
  const toneClass = {
    blue: 'text-blue-700',
    slate: 'text-slate-600',
    emerald: 'text-emerald-700',
  }[tone]

  return (
    <div className="border-b border-[var(--app-border)] px-6 py-5 last:border-b-0 sm:border-b-0 sm:border-l sm:last:border-l-0">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${toneClass}`}>{arabicNumber.format(value)}</p>
    </div>
  )
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-bold transition sm:flex-none ${active ? 'bg-white text-[var(--app-primary)] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{children}</button>
}

function CodeBadge({ value }: { value: string }) {
  return <span dir="ltr" className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold tracking-wide text-slate-700">{value}</span>
}

function StatusBadge({ archived }: { archived: boolean }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${archived ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{archived ? 'مؤرشف' : 'نشط'}</span>
}

function CategoryActions({ category, pending, onRename, onToggleArchive }: { category: DynamicCategory; pending: boolean; onRename: (category: DynamicCategory) => void; onToggleArchive: (category: DynamicCategory) => void }) {
  return (
    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => onRename(category)} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100">تغيير الاسم</button>
      <button type="button" disabled={pending} onClick={() => onToggleArchive(category)} className={`rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${category.is_archived ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>{category.is_archived ? 'إعادة التنشيط' : 'أرشفة'}</button>
    </div>
  )
}

function CategoriesLoading() {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="جاري تحميل الأقسام">
      {[0, 1, 2].map((item) => <div key={item} className="h-40 animate-pulse rounded-3xl border border-slate-100 bg-slate-50" />)}
    </div>
  )
}
