import { useState } from 'react'
import type { ItemMovement } from '../../../services/itemsService'
import { getDisplayText } from '../../inventory-operations/operationForm'
import { formatMovementDate } from '../itemDetailsUtils'
import { getLocalDateString } from '../../../utils/dateUtils'

export type ReturnMovementForm = {
  quantity: string
  operationDate: string
  receivedBy: string
  notes: string
}

type ReturnMovementDialogProps = {
  movement: ItemMovement
  internalCode?: string | null
  categoryLabel: string
  isSubmitting: boolean
  onCancel: () => void
  onSubmit: (form: ReturnMovementForm) => void
}

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{getDisplayText(value)}</dd>
    </div>
  )
}

export function ReturnMovementDialog({
  movement,
  internalCode,
  categoryLabel,
  isSubmitting,
  onCancel,
  onSubmit,
}: ReturnMovementDialogProps) {
  const [form, setForm] = useState<ReturnMovementForm>({
    quantity: '',
    operationDate: getLocalDateString(),
    receivedBy: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isConfirming, setIsConfirming] = useState(false)
  const remaining = movement.remainingReturnableQuantity

  function updateField(field: keyof ReturnMovementForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!(field in current)) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function reviewReturn() {
    const nextErrors: Record<string, string> = {}
    const quantity = Number(form.quantity)
    if (!form.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      nextErrors.quantity = 'أدخل كمية مرتجعة أكبر من صفر'
    } else if (quantity > remaining) {
      nextErrors.quantity = 'الكمية المرتجعة أكبر من الكمية المتبقية لهذه الحركة'
    }
    if (!form.operationDate) nextErrors.operationDate = 'تاريخ المرتجع مطلوب'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) setIsConfirming(true)
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onCancel()
      }}
    >
      <div role="dialog" aria-modal="true" className="my-auto w-full max-w-2xl rounded-[28px] bg-white p-6 text-right shadow-2xl">
        <h2 className="text-xl font-bold text-slate-900">تسجيل مرتجع لحركة صرف</h2>
        <p className="mt-1 text-sm text-slate-500">المرتجع مرتبط بحركة الصرف المحددة ولن يغيّر الحركة الأصلية.</p>

        <dl className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="اسم الصنف" value={movement.item_name || movement.item_label} />
          <Info label="كود الصنف الداخلي" value={movement.internal_code || internalCode} />
          <Info label="الكمية المصروفة" value={movement.quantity} />
          <Info label="الكمية المرتجعة سابقًا" value={movement.returnedQuantity} />
          <Info label="المتاح للإرجاع" value={movement.remainingReturnableQuantity} />
          <Info label="المستلم الأصلي" value={movement.issued_to || movement.received_by} />
          <Info label="تاريخ الصرف" value={formatMovementDate(movement.operation_date)} />
          <Info label="المشروع / القسم" value={movement.project_name || movement.project} />
          <Info label="التصنيف" value={movement.category_name || movement.category_label || categoryLabel} />
          <Info label="كود حركة الصرف الأصلية" value={movement.issue_code || movement.id} />
        </dl>

        {!isConfirming ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              الكمية المرتجعة
              <input
                type="number"
                min="0"
                max={remaining}
                step="any"
                value={form.quantity}
                onChange={(event) => updateField('quantity', event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-slate-400"
              />
              {errors.quantity ? <span className="mt-1 block text-xs text-red-600">{errors.quantity}</span> : null}
            </label>
            <label className="text-sm font-semibold text-slate-700">
              تاريخ المرتجع
              <input
                type="date"
                value={form.operationDate}
                onChange={(event) => updateField('operationDate', event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-slate-400"
              />
              {errors.operationDate ? <span className="mt-1 block text-xs text-red-600">{errors.operationDate}</span> : null}
            </label>
            <label className="text-sm font-semibold text-slate-700">
              استلم بواسطة
              <input
                type="text"
                value={form.receivedBy}
                onChange={(event) => updateField('receivedBy', event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-slate-400"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              ملاحظات
              <textarea
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                rows={2}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-slate-400"
              />
            </label>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-bold text-slate-900">تأكيد تسجيل المرتجع؟</p>
            <p className="mt-1 text-sm text-slate-600">
              ستتم إعادة كمية <strong>{form.quantity}</strong> إلى رصيد الصنف بتاريخ{' '}
              <strong>{formatMovementDate(form.operationDate)}</strong>.
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
            إلغاء
          </button>
          {isConfirming ? (
            <>
              <button type="button" onClick={() => setIsConfirming(false)} disabled={isSubmitting} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
                رجوع
              </button>
              <button type="button" onClick={() => onSubmit(form)} disabled={isSubmitting} className="min-w-32 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? 'جارٍ الحفظ...' : 'تأكيد المرتجع'}
              </button>
            </>
          ) : (
            <button type="button" onClick={reviewReturn} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
              متابعة
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
