import { useMemo, useState } from 'react'
import { useCustodyInventoryCatalog } from '../hooks/useCustodyInventoryCatalog'
import type { CustodyInventoryItem } from '../types'
import { matchesAnySearchValue, normalizeSearchTerm } from '../../../utils/searchUtils'

function extraDetails(item: CustodyInventoryItem) {
  const details = item.details
  if (item.tableName === 'raw_materials') {
    const dimensions = [details.length, details.width, details.th].filter((value) => value != null && value !== '').join(' × ')
    return [dimensions && `الأبعاد: ${dimensions}`, details.weight != null && `الوزن: ${String(details.weight)}`].filter(Boolean).join(' • ')
  }
  if (item.tableName === 'cylinders') return 'اسطوانة مخزون'
  return ''
}

export function CustodyManualItemTab({
  selected,
  onSelect,
}: {
  selected: CustodyInventoryItem | null
  onSelect: (item: CustodyInventoryItem) => void
}) {
  const [search, setSearch] = useState('')
  const query = useCustodyInventoryCatalog()
  const normalizedSearch = normalizeSearchTerm(search)
  const rows = useMemo(
    () => (query.data ?? []).filter((item) => matchesAnySearchValue([
      item.itemName,
      item.internalCode,
      item.categoryName,
      item.projectName,
      item.details.code_number,
    ], normalizedSearch)).slice(0, 100),
    [normalizedSearch, query.data],
  )

  return (
    <div>
      <label className="block text-sm font-bold text-slate-700" htmlFor="custody-inventory-search">
        الصنف من دليل المخزون *
      </label>
      <input
        id="custody-inventory-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="ابحث باسم الصنف أو الكود أو التصنيف أو المشروع"
        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
      />

      {query.isPending ? (
        <div className="mt-4 h-48 animate-pulse rounded-2xl bg-slate-100" />
      ) : query.isError ? (
        <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{query.error.message}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">لا توجد أصناف مطابقة للبحث</p>
      ) : (
        <div className="mt-4 max-h-[34vh] space-y-2 overflow-y-auto pe-1" role="radiogroup" aria-label="أصناف المخزون">
          {rows.map((item) => {
            const identity = `${item.tableName}:${item.itemId}`
            const isSelected = selected != null && `${selected.tableName}:${selected.itemId}` === identity
            const details = extraDetails(item)
            return (
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                key={identity}
                onClick={() => onSelect(item)}
                className={`w-full rounded-2xl border p-3 text-right transition ${
                  isSelected ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900">{item.itemName}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {[item.internalCode, item.categoryName, item.projectName].filter(Boolean).join(' • ')}
                    </div>
                    {details ? <div className="mt-1 text-xs text-slate-500">{details}</div> : null}
                  </div>
                  {item.currentStock != null ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">الرصيد: {item.currentStock}</span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      )}
      {(query.data?.length ?? 0) > 100 && rows.length === 100 ? (
        <p className="mt-2 text-xs text-slate-500">يتم عرض أول 100 نتيجة؛ استخدم البحث للوصول للصنف المطلوب.</p>
      ) : null}
    </div>
  )
}
