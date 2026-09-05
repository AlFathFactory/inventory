import { useRef, useState } from 'react'
import { useToast } from '../../../components/ToastProvider'
import { useScrapEmployeeCustody } from '../hooks/useEmployeeCustody'
import type { EmployeeCustodyRecord } from '../types'

export function ScrapCustodyModal({
  employeeId,
  custody,
  onClose,
}: {
  employeeId: string
  custody: EmployeeCustodyRecord
  onClose: () => void
}) {
  const { showToast } = useToast()
  const mutation = useScrapEmployeeCustody(employeeId)
  const savingRef = useRef(false)
  const [scrappedDate, setScrappedDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  async function save() {
    if (savingRef.current || mutation.isPending) return
    setError('')
    if (!scrappedDate) {
      setError('تاريخ التكهين مطلوب')
      return
    }
    if (!reason.trim()) {
      setError('سبب التكهين مطلوب')
      return
    }
    if (custody.receivedDate && scrappedDate < custody.receivedDate) {
      setError('تاريخ التكهين لا يمكن أن يكون قبل تاريخ الاستلام')
      return
    }
    savingRef.current = true
    try {
      await mutation.mutateAsync({
        custodyId: custody.id,
        scrappedDate,
        reason,
      })
      showToast('تم تكهين العهدة بنجاح')
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تكهين العهدة')
    } finally {
      savingRef.current = false
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="scrap-custody-title">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl">
        <h3 id="scrap-custody-title" className="text-xl font-bold text-slate-900">تكهين العهدة</h3>
        <p className="mt-1 text-sm text-slate-500">{custody.itemName}</p>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-bold text-slate-700">
            تاريخ التكهين *
            <input
              type="date"
              min={custody.receivedDate || undefined}
              value={scrappedDate}
              onChange={(event) => setScrappedDate(event.target.value)}
              className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-amber-500"
            />
          </label>
          <label className="block text-sm font-bold text-slate-700">
            سبب التكهين *
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="اكتب سبب التكهين"
              className="mt-2 block min-h-28 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-amber-500"
            />
          </label>
        </div>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">التكهين يغيّر حالة العهدة فقط، ولا يؤثر في رصيد المخزون.</p>
        {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={mutation.isPending} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 disabled:opacity-50">إلغاء</button>
          <button type="button" disabled={mutation.isPending} onClick={() => void save()} className="rounded-xl bg-amber-600 px-5 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {mutation.isPending ? 'جارٍ التكهين...' : 'تأكيد التكهين'}
          </button>
        </div>
      </div>
    </div>
  )
}
