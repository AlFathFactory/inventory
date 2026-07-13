import { useMemo, useState } from 'react'
import type { CategoryDefinition } from '../../config/categoryConfig'
import { updateItemDetails, type ItemDetails } from '../../services/itemsService'
import { updateLongWeldingGlove } from '../../services/longWeldingGlovesService'

type EditField = {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'textarea'
  required?: boolean
}

const fieldsByTable: Record<string, EditField[]> = {
  consumables: [
    { key: 'project', label: 'اسم المشروع', required: true },
    { key: 'item_name', label: 'اسم الصنف', required: true },
    { key: 'transaction_date', label: 'تاريخ العملية', type: 'date' },
    { key: 'stock_balance', label: 'الرصيد الحالي', type: 'number' },
    { key: 'min_quantity', label: 'الحد الأدنى', type: 'number' },
    { key: 'notes', label: 'ملاحظات', type: 'textarea' },
  ],
  paints: [
    { key: 'project', label: 'اسم المشروع', required: true },
    { key: 'item_name', label: 'اسم الصنف', required: true },
    { key: 'transaction_date', label: 'تاريخ العملية', type: 'date' },
    { key: 'stock_balance', label: 'الرصيد الحالي', type: 'number' },
    { key: 'min_quantity', label: 'الحد الأدنى', type: 'number' },
    { key: 'expire_date', label: 'تاريخ الانتهاء', type: 'date' },
  ],
  screws: [],
  stock_screws: [],
  raw_materials: [],
  cylinders: [
    { key: 'type_name', label: 'نوع الاسطوانة', required: true },
    { key: 'gas_balance', label: 'رصيد الغاز', type: 'number' },
    { key: 'empty_count', label: 'فارغ', type: 'number' },
    { key: 'full_count', label: 'ملي', type: 'number' },
    { key: 'transaction_date', label: 'تاريخ العملية', type: 'date' },
    { key: 'notes', label: 'ملاحظات', type: 'textarea' },
  ],
  cutting_discs: [
    { key: 'code', label: 'Code Number' },
    { key: 'type_name', label: 'اسم الصنف', required: true },
    { key: 'received_by', label: 'المستلم' },
    { key: 'received_date', label: 'تاريخ الاستلام', type: 'date' },
    { key: 'scrapped_date', label: 'تاريخ التكهيت', type: 'date' },
  ],
  long_welding_gloves: [
    { key: 'type_name', label: 'النوع', required: true },
    { key: 'received_by', label: 'المستلم', required: true },
    { key: 'received_date', label: 'تاريخ الاستلام', type: 'date', required: true },
    { key: 'notes', label: 'ملاحظات', type: 'textarea' },
  ],
}

const screwFields: EditField[] = [
  { key: 'project', label: 'اسم المشروع', required: true },
  { key: 'item_name', label: 'اسم الصنف', required: true },
  { key: 'din', label: 'DIN' },
  { key: 'code_number', label: 'Code Number' },
  { key: 'transaction_date', label: 'تاريخ العملية', type: 'date' },
  { key: 'stock_balance', label: 'الرصيد الحالي', type: 'number' },
  { key: 'min_quantity', label: 'الحد الأدنى', type: 'number' },
]

fieldsByTable.screws = screwFields
fieldsByTable.stock_screws = screwFields
fieldsByTable.raw_materials = [
  { key: 'project', label: 'اسم المشروع', required: true },
  { key: 'item_name', label: 'اسم الصنف', required: true },
  { key: 'transaction_date', label: 'تاريخ العملية', type: 'date' },
  { key: 'stock_balance', label: 'الرصيد الحالي', type: 'number' },
  { key: 'min_quantity', label: 'الحد الأدنى', type: 'number' },
  { key: 'weight', label: 'وزن', type: 'number' },
  { key: 'length', label: 'LENGTH', type: 'number' },
  { key: 'width', label: 'WIDTH', type: 'number' },
  { key: 'th', label: 'TH', type: 'number' },
  { key: 'material_source', label: 'مصدر الخامة' },
]

type Props = {
  category: CategoryDefinition
  itemId: string
  itemData: ItemDetails
  onClose: () => void
  onSuccess: (balanceChanged: boolean) => void | Promise<void>
}

function initialValue(item: ItemDetails, key: string) {
  const value =
    key === 'project'
      ? item.project ?? item.project_name
      : key === 'type_name'
        ? item.type_name ?? item.item_name
        : key === 'gas_balance'
          ? item.gas_balance ?? item.stock_balance
          : item[key]
  return value === null || value === undefined ? '' : String(value)
}

export function EditItemModal({ category, itemId, itemData, onClose, onSuccess }: Props) {
  const fields = useMemo(() => fieldsByTable[category.table] ?? [], [category.table])
  const initialForm = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.key, initialValue(itemData, field.key)])),
    [fields, itemData],
  )
  const [form, setForm] = useState<Record<string, string>>(initialForm)
  const [adjustDate, setAdjustDate] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const balanceField = category.table === 'cylinders' ? 'gas_balance' : category.stockField ? 'stock_balance' : null
  const balanceChanged = Boolean(
    balanceField && Number(form[balanceField]) !== Number(initialForm[balanceField]),
  )

  function updateField(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function submit() {
    const nextErrors: Record<string, string> = {}
    fields.forEach((field) => {
      if (field.required && !form[field.key]?.trim()) nextErrors[field.key] = 'هذا الحقل مطلوب'
      if (field.type === 'number' && form[field.key] !== '' && Number(form[field.key]) < 0) {
        nextErrors[field.key] = 'يجب ألا تقل القيمة عن صفر'
      }
      if (field.type === 'date' && form[field.key]) {
        const date = new Date(`${form[field.key]}T00:00:00`)
        const [year, month, day] = form[field.key].split('-').map(Number)
        if (
          Number.isNaN(date.getTime()) ||
          date.getFullYear() !== year ||
          date.getMonth() + 1 !== month ||
          date.getDate() !== day
        ) nextErrors[field.key] = 'يجب إدخال تاريخ محلي صالح'
      }
    })
    if (balanceChanged && !adjustDate) nextErrors.adjustDate = 'تاريخ التعديل مطلوب'
    if (balanceChanged && !adjustNotes.trim()) nextErrors.adjustNotes = 'سبب تعديل الرصيد مطلوب'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    const patch = Object.fromEntries(fields.map((field) => {
      const value = form[field.key]?.trim() ?? ''
      return [field.key, field.type === 'number' ? (value === '' ? null : Number(value)) : value || null]
    }))
    setIsSubmitting(true)
    setSubmitError(null)
    const result = category.table === 'long_welding_gloves'
      ? await updateLongWeldingGlove(itemId, {
          type_name: form.type_name.trim(),
          received_by: form.received_by.trim(),
          received_date: form.received_date,
          notes: form.notes?.trim() || null,
        })
      : await updateItemDetails({
      tableName: category.table,
      itemId,
      patch,
      adjustDate: balanceChanged ? adjustDate : null,
      notes: balanceChanged ? adjustNotes.trim() : null,
      updatedBy: 'user',
        })
    setIsSubmitting(false)
    if (result.error) {
      setSubmitError(result.error)
      return
    }
    await onSuccess(balanceChanged)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6" dir="rtl">
      <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)] p-6 shadow-2xl lg:p-8">
        <div className="flex items-start justify-between gap-4">
          <div><h3 className="text-2xl font-bold text-slate-900">تعديل الصنف</h3><p className="mt-1 text-sm text-[var(--app-text-muted)]">عدّل البيانات المطلوبة ثم احفظ التغييرات.</p></div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">×</button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {fields.map((field) => (
            <label key={field.key} className={field.type === 'textarea' ? 'space-y-2 md:col-span-2' : 'space-y-2'}>
              <span className="block text-sm font-semibold text-slate-700">{field.label}{field.required ? ' *' : ''}</span>
              {field.type === 'textarea' ? (
                <textarea value={form[field.key] ?? ''} onChange={(e) => updateField(field.key, e.target.value)} rows={3} className="w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--app-primary)]" />
              ) : (
                <input type={field.type ?? 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 'any' : undefined} value={form[field.key] ?? ''} onChange={(e) => updateField(field.key, e.target.value)} className="h-[46px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm outline-none focus:border-[var(--app-primary)]" />
              )}
              {errors[field.key] ? <span className="block text-xs text-red-600">{errors[field.key]}</span> : null}
            </label>
          ))}
        </div>
        {balanceChanged ? (
          <div className="mt-6 grid gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 md:grid-cols-2">
            <label className="space-y-2"><span className="block text-sm font-semibold text-slate-700">تاريخ التعديل *</span><input type="date" value={adjustDate} onChange={(e) => { setAdjustDate(e.target.value); setErrors((current) => ({ ...current, adjustDate: '' })) }} className="h-[46px] w-full rounded-2xl border border-blue-200 bg-white px-4 text-sm" />{errors.adjustDate ? <span className="text-xs text-red-600">{errors.adjustDate}</span> : null}</label>
            <label className="space-y-2"><span className="block text-sm font-semibold text-slate-700">سبب تعديل الرصيد *</span><textarea value={adjustNotes} onChange={(e) => { setAdjustNotes(e.target.value); setErrors((current) => ({ ...current, adjustNotes: '' })) }} rows={2} className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm" />{errors.adjustNotes ? <span className="text-xs text-red-600">{errors.adjustNotes}</span> : null}</label>
          </div>
        ) : null}
        {submitError ? <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</div> : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-start"><button type="button" onClick={onClose} disabled={isSubmitting} className="h-[46px] rounded-2xl px-6 text-sm font-bold text-slate-700 hover:bg-slate-100">إلغاء</button><button type="button" onClick={() => void submit()} disabled={isSubmitting} className="h-[46px] min-w-[160px] rounded-2xl bg-[var(--app-primary)] px-6 text-sm font-bold text-white disabled:opacity-60">{isSubmitting ? 'جاري الحفظ...' : 'حفظ التعديلات'}</button></div>
      </div>
    </div>
  )
}
