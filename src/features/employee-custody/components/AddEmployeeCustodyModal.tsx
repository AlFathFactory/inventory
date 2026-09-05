import { useState } from 'react'
import { useToast } from '../../../components/ToastProvider'
import { useAddEmployeeCustody } from '../hooks/useEmployeeCustody'
import type { CustodyInventoryItem, CustodyIssueCandidate } from '../types'
import { CustodyIssueCandidatesTab } from './CustodyIssueCandidatesTab'
import { CustodyManualItemTab } from './CustodyManualItemTab'

type AddMode = 'issue' | 'manual'

export function AddEmployeeCustodyModal({
  employeeId,
  onClose,
}: {
  employeeId: string
  onClose: () => void
}) {
  const { showToast } = useToast()
  const mutation = useAddEmployeeCustody(employeeId)
  const [mode, setMode] = useState<AddMode>('issue')
  const [selectedIssue, setSelectedIssue] = useState<CustodyIssueCandidate | null>(null)
  const [selectedItem, setSelectedItem] = useState<CustodyInventoryItem | null>(null)
  const [receivedDate, setReceivedDate] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const [validationError, setValidationError] = useState('')

  async function save() {
    setValidationError('')
    const parsedQuantity = Number(quantity)
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setValidationError('يجب أن تكون الكمية أكبر من صفر')
      return
    }

    if (mode === 'issue') {
      if (!selectedIssue) {
        setValidationError('اختر حركة صرف لتسجيلها كعهدة')
        return
      }
      if (!selectedIssue.operationDate) {
        setValidationError('حركة الصرف لا تحتوي على تاريخ استلام صالح')
        return
      }
      const meaningfulQuantity = Math.max(selectedIssue.quantity - selectedIssue.returnedQuantity, 0)
      if (meaningfulQuantity > 0 && parsedQuantity > meaningfulQuantity) {
        setValidationError(`الكمية لا يمكن أن تتجاوز المتاح من حركة الصرف (${meaningfulQuantity})`)
        return
      }
      try {
        await mutation.mutateAsync({
          employeeId,
          tableName: selectedIssue.tableName,
          itemId: selectedIssue.itemId,
          sourceIssueOperationId: selectedIssue.operationId,
          receivedDate: selectedIssue.operationDate,
          quantity: parsedQuantity,
          notes,
        })
        showToast('تم تسجيل العهدة بنجاح')
        onClose()
      } catch (error) {
        setValidationError(error instanceof Error ? error.message : 'تعذر تسجيل العهدة')
      }
      return
    }

    if (!selectedItem) {
      setValidationError('الصنف مطلوب')
      return
    }
    if (!receivedDate) {
      setValidationError('تاريخ الاستلام مطلوب')
      return
    }
    try {
      await mutation.mutateAsync({
        employeeId,
        tableName: selectedItem.tableName,
        itemId: selectedItem.itemId,
        sourceIssueOperationId: null,
        receivedDate,
        quantity: parsedQuantity,
        notes,
      })
      showToast('تم تسجيل العهدة بنجاح')
      onClose()
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'تعذر تسجيل العهدة')
    }
  }

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/55 p-3 sm:p-5" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="add-custody-title">
      <div className="mx-auto my-3 w-full max-w-3xl rounded-[28px] bg-white p-5 shadow-2xl sm:my-8 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="add-custody-title" className="text-xl font-bold text-slate-900">تحديد عهدة</h3>
            <p className="mt-1 text-sm text-slate-500">التسجيل هنا لا يغيّر رصيد المخزون ولا ينشئ حركة صرف.</p>
          </div>
          <button type="button" disabled={mutation.isPending} onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2 text-sm disabled:opacity-50">إغلاق</button>
        </div>

        <div className="mt-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => { setMode('issue'); setValidationError('') }}
            className={`rounded-xl px-3 py-2.5 text-sm font-bold ${mode === 'issue' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
          >
            من الأصناف المصروفة للموظف
          </button>
          <button
            type="button"
            onClick={() => { setMode('manual'); setValidationError('') }}
            className={`rounded-xl px-3 py-2.5 text-sm font-bold ${mode === 'manual' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
          >
            اختيار صنف آخر
          </button>
        </div>

        <div className="mt-5">
          {mode === 'issue' ? (
            <CustodyIssueCandidatesTab employeeId={employeeId} selected={selectedIssue} onSelect={setSelectedIssue} />
          ) : (
            <CustodyManualItemTab selected={selectedItem} onSelect={setSelectedItem} />
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {mode === 'manual' ? (
            <label className="text-sm font-bold text-slate-700">
              تاريخ الاستلام *
              <input
                type="date"
                value={receivedDate}
                onChange={(event) => setReceivedDate(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500"
              />
            </label>
          ) : null}
          <label className="text-sm font-bold text-slate-700">
            الكمية
            <input
              type="number"
              min="0.000001"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-500"
            />
          </label>
          <label className="text-sm font-bold text-slate-700 sm:col-span-2">
            ملاحظات
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-2 block min-h-20 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-blue-500"
              placeholder="ملاحظات اختيارية"
            />
          </label>
        </div>

        {validationError ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{validationError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={mutation.isPending} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 disabled:opacity-50">إلغاء</button>
          <button type="button" disabled={mutation.isPending} onClick={() => void save()} className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {mutation.isPending ? 'جارٍ تسجيل العهدة...' : 'تسجيل العهدة'}
          </button>
        </div>
      </div>
    </div>
  )
}
