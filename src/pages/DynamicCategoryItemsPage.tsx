import { useDeferredValue, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SearchInput } from '../components/SearchInput'
import { useToast } from '../components/ToastProvider'
import { DynamicItemFormDialog } from '../features/dynamic-categories/components/DynamicItemFormDialog'
import { DynamicStockStatusBadge } from '../features/dynamic-categories/components/DynamicStockStatusBadge'
import {
  dynamicCategoryItemsQueryOptions,
  dynamicCategoryQueryOptions,
  useCreateDynamicItem,
  useSetDynamicItemArchived,
  useUpdateDynamicItem,
} from '../features/dynamic-categories/dynamicCategoryQueries'
import {
  DynamicItemCodeGenerationError,
  DynamicResourceNotFoundError,
} from '../features/dynamic-categories/dynamicCategoryService'
import { getDynamicItemDetailsRoute } from '../features/dynamic-categories/dynamicCategoryRoutes'
import type {
  DynamicCategoryItem,
  DynamicItemArchiveFilter,
  DynamicItemCreateInput,
  DynamicItemEditInput,
  DynamicItemSort,
  DynamicItemStatusFilter,
} from '../features/dynamic-categories/types'

const arabicNumber = new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 })
const arabicDate = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' })

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : arabicDate.format(date)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'تعذر تنفيذ العملية.'
}

export function DynamicCategoryItemsPage() {
  const { categoryId = '' } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [archiveFilter, setArchiveFilter] = useState<DynamicItemArchiveFilter>('active')
  const [statusFilter, setStatusFilter] = useState<DynamicItemStatusFilter>('all')
  const [sort, setSort] = useState<DynamicItemSort>('name')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<DynamicCategoryItem | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const filters = useMemo(
    () => ({ search: deferredSearch, archive: archiveFilter, status: statusFilter, sort }),
    [archiveFilter, deferredSearch, sort, statusFilter],
  )
  const categoryQuery = useQuery(dynamicCategoryQueryOptions(categoryId))
  const itemsQuery = useQuery(dynamicCategoryItemsQueryOptions(categoryId, filters))
  const createMutation = useCreateDynamicItem()
  const updateMutation = useUpdateDynamicItem(categoryId)
  const archiveMutation = useSetDynamicItemArchived(categoryId)
  const category = categoryQuery.data
  const items = itemsQuery.data ?? []

  async function createItem(input: DynamicItemCreateInput) {
    setFormError(null)
    try {
      const createdItem = await createMutation.mutateAsync(input)
      setIsCreateOpen(false)
      showToast(`تم إنشاء الصنف وتوليد الكود ${createdItem.internal_code ?? ''} بنجاح.`)
    } catch (error) {
      if (error instanceof DynamicItemCodeGenerationError) {
        setIsCreateOpen(false)
        showToast(error.message, 'error')
        return
      }
      setFormError(errorMessage(error))
    }
  }

  async function editItem(input: DynamicItemEditInput) {
    if (!editingItem) return
    setFormError(null)
    try {
      await updateMutation.mutateAsync({ itemId: editingItem.id, input })
      setEditingItem(null)
      showToast('تم تحديث بيانات الصنف دون تغيير الكود أو الرصيد.')
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  async function toggleItemArchive(item: DynamicCategoryItem) {
    const isArchived = !item.is_archived
    if (
      isArchived &&
      !window.confirm(`هل تريد أرشفة الصنف «${item.item_name}»؟ لن تُحذف بياناته أو حركاته.`)
    ) {
      return
    }

    try {
      await archiveMutation.mutateAsync({ itemId: item.id, isArchived })
      showToast(isArchived ? 'تمت أرشفة الصنف.' : 'تمت استعادة الصنف.')
    } catch (error) {
      showToast(errorMessage(error), 'error')
    }
  }

  if (categoryQuery.error instanceof DynamicResourceNotFoundError) {
    return <NotFoundState resource="التصنيف" backTo="/dynamic-categories" />
  }

  return (
    <section dir="rtl" className="space-y-6">
      <div className={`overflow-hidden rounded-[28px] border bg-white shadow-[var(--app-shadow)] ${category?.is_archived ? 'border-slate-300' : 'border-[var(--app-border)]'}`}>
        {category?.is_archived ? (
          <div className="border-b border-slate-200 bg-slate-100 px-6 py-3 text-sm font-bold text-slate-700">
            هذا التصنيف مؤرشف. يمكنك استعراض أصنافه، لكن أعد تنشيطه قبل إضافة الأصناف أو تعديلها.
          </div>
        ) : null}
        <div className="p-6 sm:p-8">
          <Link to="/dynamic-categories" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--app-primary)] hover:underline"><span aria-hidden="true">→</span>العودة إلى التصنيفات</Link>
          {categoryQuery.isPending ? <div className="mt-6 h-24 animate-pulse rounded-3xl bg-slate-50" /> : null}
          {categoryQuery.isError && !(categoryQuery.error instanceof DynamicResourceNotFoundError) ? <ErrorState title="تعذر تحميل التصنيف" error={categoryQuery.error} onRetry={() => void categoryQuery.refetch()} /> : null}
          {category ? (
            <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">{category.name}</h2>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${category.is_archived ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{category.is_archived ? 'مؤرشف' : 'نشط'}</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">إدارة أصناف التصنيف وبياناتها الأساسية دون تنفيذ عمليات مخزون.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-4 rounded-2xl bg-slate-50 px-5 py-3">
                  <div><p className="text-xs text-slate-500">كود التصنيف</p><p dir="ltr" className="mt-1 font-mono text-sm font-black text-slate-800">{category.code_prefix}</p></div>
                  <span className="h-9 w-px bg-slate-200" />
                  <div><p className="text-xs text-slate-500">عدد الأصناف</p><p className="mt-1 text-sm font-black text-slate-800">{arabicNumber.format(category.item_count)}</p></div>
                </div>
                <button type="button" disabled={category.is_archived} onClick={() => { setFormError(null); setIsCreateOpen(true) }} className="h-12 rounded-2xl bg-[var(--app-primary)] px-5 text-sm font-bold text-white transition hover:bg-[var(--app-primary-strong)] disabled:cursor-not-allowed disabled:bg-slate-300">+ إضافة صنف</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-[28px] border border-[var(--app-border)] bg-white p-4 shadow-[var(--app-shadow)] sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_repeat(3,minmax(140px,auto))] lg:items-end">
          <label className="space-y-2"><span className="block text-sm font-bold text-slate-700">ابحث عن صنف</span><SearchInput value={search} onValueChange={setSearch} placeholder="الاسم أو الكود أو المورد أو المشروع" className="h-12 w-full rounded-2xl border border-[var(--app-border)] bg-slate-50 px-4 text-sm outline-none focus:border-[var(--app-primary)] focus:bg-white" /></label>
          <FilterSelect label="حالة المخزون" value={statusFilter} onChange={(value) => setStatusFilter(value as DynamicItemStatusFilter)} options={[['all','الكل'],['safe','آمن'],['low','قليل'],['out','منتهي']]} />
          <FilterSelect label="الأرشفة" value={archiveFilter} onChange={(value) => setArchiveFilter(value as DynamicItemArchiveFilter)} options={[['active','نشط'],['archived','مؤرشف'],['all','الكل']]} />
          <FilterSelect label="الترتيب" value={sort} onChange={(value) => setSort(value as DynamicItemSort)} options={[['name','الاسم'],['code','الكود'],['balance','الرصيد'],['updated','آخر تحديث']]} />
        </div>

        {itemsQuery.isPending ? <ItemsLoading /> : null}
        {itemsQuery.isError ? <ErrorState title="تعذر تحميل الأصناف" error={itemsQuery.error} onRetry={() => void itemsQuery.refetch()} /> : null}

        {!itemsQuery.isPending && !itemsQuery.isError && items.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">▦</div>
            <h3 className="mt-4 font-black text-slate-900">{category?.item_count === 0 ? 'لا توجد أصناف في هذا التصنيف بعد' : 'لا توجد أصناف مطابقة'}</h3>
            <p className="mt-2 text-sm text-slate-500">{category?.item_count === 0 ? 'أضف أول صنف وسيُنشئ النظام كوده وحركة رصيده الافتتاحي تلقائيًا.' : 'جرّب تغيير البحث أو عوامل التصفية.'}</p>
            {category && !category.is_archived && category.item_count === 0 ? <button type="button" onClick={() => setIsCreateOpen(true)} className="mt-5 rounded-xl bg-[var(--app-primary)] px-4 py-2 text-sm font-bold text-white">إضافة أول صنف</button> : null}
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-[var(--app-border)] md:block">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600"><tr><th className="px-5 py-4">الصنف</th><th className="px-5 py-4">الكود الداخلي</th><th className="px-5 py-4">الرصيد / الحد الأدنى</th><th className="px-5 py-4">الحالة</th><th className="px-5 py-4">المورد / المشروع</th><th className="px-5 py-4">آخر تحديث</th><th className="px-5 py-4">الإجراءات</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} onClick={() => navigate(getDynamicItemDetailsRoute(categoryId, item.id))} className={`cursor-pointer transition hover:bg-blue-50/40 ${item.is_archived ? 'bg-slate-50/70 text-slate-500' : ''}`}>
                      <td className="px-5 py-4 font-black text-slate-900">{item.item_name}{item.is_archived ? <span className="mr-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">مؤرشف</span> : null}</td>
                      <td dir="ltr" className="px-5 py-4 font-mono text-xs font-bold">{item.internal_code || 'قيد التوليد'}</td>
                      <td className="px-5 py-4"><span className="font-black text-slate-900">{arabicNumber.format(item.stock_balance)}</span><span className="text-slate-400"> / {arabicNumber.format(item.min_quantity ?? 0)}</span></td>
                      <td className="px-5 py-4"><DynamicStockStatusBadge stockBalance={item.stock_balance} minQuantity={item.min_quantity} /></td>
                      <td className="px-5 py-4"><p className="font-semibold text-slate-700">{item.supplier_name || '—'}</p>{item.project ? <p className="mt-1 text-xs text-slate-500">{item.project}</p> : null}</td>
                      <td className="px-5 py-4 text-slate-600">{formatDate(item.updated_at)}</td>
                      <td className="px-5 py-4"><ItemActions item={item} disabled={Boolean(category?.is_archived) || archiveMutation.isPending} onEdit={(selected) => { setFormError(null); setEditingItem(selected) }} onArchive={(selected) => void toggleItemArchive(selected)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 grid gap-4 md:hidden">
              {items.map((item) => (
                <article key={item.id} onClick={() => navigate(getDynamicItemDetailsRoute(categoryId, item.id))} className={`cursor-pointer rounded-3xl border border-[var(--app-border)] p-5 ${item.is_archived ? 'bg-slate-50 text-slate-500' : 'bg-white'}`}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-lg font-black text-slate-900">{item.item_name}</h3><p dir="ltr" className="mt-1 text-left font-mono text-xs text-slate-500">{item.internal_code || 'قيد التوليد'}</p></div><DynamicStockStatusBadge stockBalance={item.stock_balance} minQuantity={item.min_quantity} /></div>
                  <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm"><div><dt className="text-xs text-slate-500">الرصيد</dt><dd className="mt-1 font-black text-slate-900">{arabicNumber.format(item.stock_balance)}</dd></div><div><dt className="text-xs text-slate-500">الحد الأدنى</dt><dd className="mt-1 font-bold text-slate-700">{arabicNumber.format(item.min_quantity ?? 0)}</dd></div><div><dt className="text-xs text-slate-500">المورد</dt><dd className="mt-1 truncate font-semibold">{item.supplier_name || '—'}</dd></div><div><dt className="text-xs text-slate-500">المشروع</dt><dd className="mt-1 truncate font-semibold">{item.project || '—'}</dd></div></dl>
                  <p className="mt-3 text-xs text-slate-500">آخر تحديث: {formatDate(item.updated_at)}</p>
                  <div className="mt-4 border-t border-slate-100 pt-4"><ItemActions item={item} disabled={Boolean(category?.is_archived) || archiveMutation.isPending} onEdit={(selected) => { setFormError(null); setEditingItem(selected) }} onArchive={(selected) => void toggleItemArchive(selected)} /></div>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {isCreateOpen ? <DynamicItemFormDialog mode="create" categoryId={categoryId} isSaving={createMutation.isPending} error={formError} onClose={() => { if (!createMutation.isPending) setIsCreateOpen(false) }} onSubmit={createItem} /> : null}
      {editingItem ? <DynamicItemFormDialog mode="edit" categoryId={categoryId} item={editingItem} isSaving={updateMutation.isPending} error={formError} onClose={() => { if (!updateMutation.isPending) setEditingItem(null) }} onSubmit={editItem} /> : null}
    </section>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="space-y-2"><span className="block text-sm font-bold text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-[var(--app-primary)]">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
}

function ItemActions({ item, disabled, onEdit, onArchive }: { item: DynamicCategoryItem; disabled: boolean; onEdit: (item: DynamicCategoryItem) => void; onArchive: (item: DynamicCategoryItem) => void }) {
  return <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}><button type="button" disabled={disabled} onClick={() => onEdit(item)} className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-40">تعديل</button><button type="button" disabled={disabled} onClick={() => onArchive(item)} className={`rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-40 ${item.is_archived ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.is_archived ? 'استعادة' : 'أرشفة'}</button></div>
}

function ItemsLoading() {
  return <div className="mt-6 space-y-3" aria-label="جاري تحميل الأصناف">{[0, 1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-2xl bg-slate-50" />)}</div>
}

function ErrorState({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  return <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-5 py-8 text-center"><p className="font-black text-red-800">{title}</p><p className="mt-2 text-sm text-red-700">{errorMessage(error)}</p><button type="button" onClick={onRetry} className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white">إعادة المحاولة</button></div>
}

function NotFoundState({ resource, backTo }: { resource: string; backTo: string }) {
  return <section dir="rtl" className="rounded-[28px] border border-[var(--app-border)] bg-white px-6 py-16 text-center shadow-[var(--app-shadow)]"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">؟</div><h2 className="mt-5 text-xl font-black text-slate-900">{resource} المطلوب غير موجود</h2><p className="mt-2 text-sm text-slate-500">قد يكون الرابط غير صحيح أو تم حذف السجل.</p><Link to={backTo} className="mt-6 inline-flex rounded-xl bg-[var(--app-primary)] px-5 py-2.5 text-sm font-bold text-white">العودة</Link></section>
}
