type PermanentDeleteModalProps = {
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
}

export function PermanentDeleteModal({
  isDeleting,
  onClose,
  onConfirm,
}: PermanentDeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="permanent-delete-title"
    >
      <div className="w-full max-w-lg rounded-[32px] border border-red-100 bg-[var(--app-panel)] p-6 shadow-2xl lg:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="permanent-delete-title" className="text-2xl font-bold text-slate-900">
              حذف السجل نهائيًا
            </h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              هل أنت متأكد من حذف هذا السجل نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="إغلاق"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-start">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="h-[46px] rounded-2xl px-6 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isDeleting}
            className="h-[46px] min-w-[150px] rounded-2xl bg-red-600 px-6 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? 'جاري الحذف...' : 'حذف نهائي'}
          </button>
        </div>
      </div>
    </div>
  )
}
