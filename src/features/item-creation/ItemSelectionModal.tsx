import { useMemo, useState } from 'react'
import { SearchInput } from '../../components/SearchInput'
import type { CategorySummaryItem } from '../../services/itemsService'
import { matchesAnySearchValue, normalizeSearchTerm } from '../../utils/searchUtils'

type ItemSelectionModalProps = {
  items: CategorySummaryItem[]
  title: string
  description: string
  emptyMessage: string
  confirmLabel: string
  createLabel?: string
  onClose: () => void
  onCreateNew?: () => void
  onSelectItem: (item: CategorySummaryItem) => void
}

function getDisplayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  return String(value)
}

export function ItemSelectionModal({
  items,
  title,
  description,
  emptyMessage,
  confirmLabel,
  createLabel,
  onClose,
  onCreateNew,
  onSelectItem,
}: ItemSelectionModalProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredItems = useMemo(() => {
    const normalizedSearchTerm = normalizeSearchTerm(searchTerm)

    return items.filter((item) =>
      matchesAnySearchValue(
        [
          item.internal_code,
          item.item_name,
          item.project_name,
          item.material_source,
          item.supplier_name,
          item.code_number,
          item.din,
        ],
        normalizedSearchTerm,
      ),
    )
  }, [items, searchTerm])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-[var(--app-border)] bg-[var(--app-panel)] p-6 shadow-2xl lg:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="text-right">
            <h3 className="text-[1.5rem] font-bold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchInput
              value={searchTerm}
              onValueChange={setSearchTerm}
              placeholder="ابحث عن الصنف أو القسم"
              className="h-[46px] min-w-[220px] flex-1 rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-[var(--app-primary)]"
            />

            {createLabel && onCreateNew ? (
              <button
                type="button"
                onClick={onCreateNew}
                className="inline-flex h-[44px] items-center rounded-2xl border border-[var(--app-border)] bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {createLabel}
              </button>
            ) : null}
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--app-border)] px-5 py-10 text-center text-sm text-slate-500">
              {emptyMessage}
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredItems.map((item) => (
                <button
                  key={`${item.table_name}-${item.item_id}`}
                  type="button"
                  onClick={() => onSelectItem(item)}
                  className="flex w-full items-center justify-between gap-4 rounded-[24px] border border-[var(--app-border)] bg-white px-5 py-4 text-right transition hover:border-[var(--app-primary)] hover:bg-slate-50"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900">
                      {getDisplayValue(item.item_name)}
                    </div>
                    <div dir="ltr" className="w-fit select-all font-mono text-sm font-semibold text-slate-600">
                      {getDisplayValue(item.internal_code)}
                    </div>
                    <div className="text-sm text-slate-500">
                      القسم: {getDisplayValue(item.project_name)}
                    </div>
                    <div className="text-sm text-slate-500">
                      الرصيد: {getDisplayValue(item.stock_balance)}
                    </div>
                  </div>

                  <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {confirmLabel}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
