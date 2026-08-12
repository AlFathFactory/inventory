import { useState, type FormEvent } from 'react'
import type { DynamicCategoryItem, DynamicItemCreateInput, DynamicItemEditInput } from '../types'
import { validateDynamicItemValues } from '../dynamicItemUtils'

type CreateProps = {
  mode: 'create'
  categoryId: string
  item?: never
  onSubmit: (input: DynamicItemCreateInput) => Promise<void>
}

type EditProps = {
  mode: 'edit'
  categoryId: string
  item: DynamicCategoryItem
  onSubmit: (input: DynamicItemEditInput) => Promise<void>
}

type DynamicItemFormDialogProps = (CreateProps | EditProps) & {
  isSaving: boolean
  error: string | null
  onClose: () => void
}

export function DynamicItemFormDialog(props: DynamicItemFormDialogProps) {
  const isCreate = props.mode === 'create'
  const [itemName, setItemName] = useState(props.item?.item_name ?? '')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [minQuantity, setMinQuantity] = useState(String(props.item?.min_quantity ?? 0))
  const [supplierName, setSupplierName] = useState(props.item?.supplier_name ?? '')
  const [project, setProject] = useState(props.item?.project ?? '')
  const [notes, setNotes] = useState(props.item?.notes ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const opening = isCreate ? Number(openingBalance) : 0
    const minimum = Number(minQuantity)
    const validationError = validateDynamicItemValues(itemName, opening, minimum)
    if (validationError) {
      setLocalError(validationError)
      return
    }

    setLocalError(null)
    if (props.mode === 'create') {
      await props.onSubmit({
        categoryId: props.categoryId,
        itemName,
        openingBalance: opening,
        minQuantity: minimum,
        supplierName,
        notes,
      })
      return
    }

    await props.onSubmit({ itemName, project, supplierName, minQuantity: minimum, notes })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !props.isSaving) props.onClose()
      }}
    >
      <form
        onSubmit={(event) => void submit(event)}
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-7"
        aria-labelledby="dynamic-item-dialog-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="dynamic-item-dialog-title" className="text-xl font-black text-slate-950">
              {isCreate ? 'إضافة صنف جديد' : 'تعديل بيانات الصنف'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {isCreate
                ? 'الكود الداخلي وحركة الرصيد الافتتاحي ينشئهما النظام تلقائيًا.'
                : 'الرصيد والكود الداخلي وحقول النظام غير قابلة للتعديل من هذا النموذج.'}
            </p>
          </div>
          <button type="button" onClick={props.onClose} disabled={props.isSaving} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600 disabled:opacity-50" aria-label="إغلاق">×</button>
        </div>

        {!isCreate && props.item ? (
          <div className="mt-5 flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
            <span className="text-sm font-bold text-blue-800">الكود الداخلي — للقراءة فقط</span>
            <span dir="ltr" className="font-mono text-sm font-black text-blue-900">{props.item.internal_code || 'لم يُولد بعد'}</span>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <FormField label="اسم الصنف *" wide>
            <input autoFocus value={itemName} onChange={(event) => { setItemName(event.target.value); setLocalError(null) }} placeholder="مثال: رول تغليف حراري" className="h-12 w-full rounded-2xl border border-[var(--app-border)] px-4 text-sm outline-none focus:border-[var(--app-primary)] focus:ring-4 focus:ring-blue-50" />
          </FormField>

          {isCreate ? (
            <FormField label="الرصيد الافتتاحي">
              <input type="number" min="0" step="any" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} className="h-12 w-full rounded-2xl border border-[var(--app-border)] px-4 text-sm outline-none focus:border-[var(--app-primary)]" />
            </FormField>
          ) : (
            <FormField label="المشروع">
              <input value={project} onChange={(event) => setProject(event.target.value)} placeholder="اختياري" className="h-12 w-full rounded-2xl border border-[var(--app-border)] px-4 text-sm outline-none focus:border-[var(--app-primary)]" />
            </FormField>
          )}

          <FormField label="الحد الأدنى">
            <input type="number" min="0" step="any" value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} className="h-12 w-full rounded-2xl border border-[var(--app-border)] px-4 text-sm outline-none focus:border-[var(--app-primary)]" />
          </FormField>

          <FormField label="المورد" wide={isCreate}>
            <input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="اختياري" className="h-12 w-full rounded-2xl border border-[var(--app-border)] px-4 text-sm outline-none focus:border-[var(--app-primary)]" />
          </FormField>

          <FormField label="ملاحظات" wide>
            <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ملاحظات اختيارية" className="w-full rounded-2xl border border-[var(--app-border)] px-4 py-3 text-sm outline-none focus:border-[var(--app-primary)]" />
          </FormField>
        </div>

        {localError || props.error ? <p role="alert" className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{localError ?? props.error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={props.onClose} disabled={props.isSaving} className="h-11 rounded-2xl px-5 text-sm font-bold text-slate-600 disabled:opacity-50">إلغاء</button>
          <button type="submit" disabled={props.isSaving} className="h-11 rounded-2xl bg-[var(--app-primary)] px-6 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{props.isSaving ? 'جاري الحفظ...' : isCreate ? 'إنشاء الصنف' : 'حفظ التعديلات'}</button>
        </div>
      </form>
    </div>
  )
}

function FormField({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`space-y-2 ${wide ? 'sm:col-span-2' : ''}`}><span className="block text-sm font-bold text-slate-700">{label}</span>{children}</label>
}
