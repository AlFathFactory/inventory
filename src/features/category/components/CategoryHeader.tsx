import type { CategoryDefinition } from '../../../config/categoryConfig'

type CategoryHeaderProps = {
  category: CategoryDefinition
  isCustodyCategory: boolean
  onAddQuantity: () => void
  onIssueQuantity: () => void
  onCreateItem: () => void
}

export function CategoryHeader({
  category,
  isCustodyCategory,
  onAddQuantity,
  onIssueQuantity,
  onCreateItem,
}: CategoryHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-right">
        <h2 className="text-xl font-bold text-slate-900">{category.label}</h2>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">
          {isCustodyCategory
            ? 'سجلات العهدة الخاصة بهذا القسم.'
            : 'إدارة الأصناف والحركات الخاصة بهذا القسم.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {category.operationsEnabled ? (
          <>
            <button
              type="button"
              onClick={onAddQuantity}
              className="inline-flex h-[44px] items-center rounded-2xl bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              إضافة
            </button>
            <button
              type="button"
              onClick={onIssueQuantity}
              className="inline-flex h-[44px] items-center rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              صرف
            </button>
          </>
        ) : null}

        {category.createFields?.length ? (
          <button
            type="button"
            onClick={onCreateItem}
            className="inline-flex h-[44px] items-center rounded-2xl border border-[var(--app-border)] bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {category.table === 'cutting_discs' ? 'إضافة صاروخ' : 'إضافة صنف جديد'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
