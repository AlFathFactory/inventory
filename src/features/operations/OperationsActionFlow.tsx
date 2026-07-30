import {
  categoryEntries,
  type CategoryKey,
} from '../../config/categoryConfig'

type OperationsChoiceModalProps = {
  onClose: () => void
  onExistingItem: () => void
  onNewItem: () => void
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600 transition hover:bg-slate-200"
      aria-label="إغلاق"
    >
      ×
    </button>
  )
}

function ExistingItemIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      <path d="M16.5 14.5v4M14.5 16.5h4" />
    </svg>
  )
}

function NewItemIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
      <path d="M5 4h10l4 4v12H5z" />
      <path d="M15 4v4h4M12 11v6M9 14h6" />
    </svg>
  )
}

export function OperationsChoiceModal({
  onClose,
  onExistingItem,
  onNewItem,
}: OperationsChoiceModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" dir="rtl">
      <div className="w-full max-w-2xl rounded-[30px] border border-[var(--app-border)] bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              إضافة للمخزون
            </span>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">هل الصنف مسجل بالفعل؟</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              اختر حالة واحدة فقط، وسنفتح لك الخطوة المناسبة مباشرة.
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={onExistingItem}
            className="group rounded-[24px] border-2 border-blue-500 bg-blue-50/70 p-5 text-right transition hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-lg"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <ExistingItemIcon />
            </span>
            <strong className="mt-5 block text-lg text-slate-900">صنف موجود</strong>
            <span className="mt-1 block text-sm leading-6 text-slate-600">
              ابحث عن الصنف، ثم أدخل الكمية والمورد.
            </span>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-700">
              اختيار الصنف
              <span aria-hidden="true">←</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onNewItem}
            className="group rounded-[24px] border border-slate-200 bg-white p-5 text-right transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <NewItemIcon />
            </span>
            <strong className="mt-5 block text-lg text-slate-900">صنف جديد</strong>
            <span className="mt-1 block text-sm leading-6 text-slate-600">
              اختر نوع المخزن، ثم سجّل بيانات الصنف ورصيده الأول.
            </span>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-slate-700">
              إنشاء صنف
              <span aria-hidden="true">←</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

type OperationsCategoryModalProps = {
  onClose: () => void
  onSelect: (categoryKey: CategoryKey) => void
}

export function OperationsCategoryModal({
  onClose,
  onSelect,
}: OperationsCategoryModalProps) {
  const categories = categoryEntries.filter(([, category]) =>
    Boolean(category.operationsEnabled && category.createFields?.length),
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" dir="rtl">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[30px] border border-[var(--app-border)] bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">اختر نوع المخزن</h2>
            <p className="mt-1 text-sm text-slate-500">
              سنعرض حقول الصنف المناسبة للنوع الذي تختاره.
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {categories.map(([key, category]) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className="flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-right transition hover:border-blue-400 hover:bg-blue-50/50"
            >
              <span>
                <strong className="block text-base text-slate-900">{category.label}</strong>
                <span className="mt-1 block text-xs text-slate-500">إضافة صنف جديد</span>
              </span>
              <span className="text-lg text-blue-600" aria-hidden="true">←</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
