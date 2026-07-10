import type { ChangeEvent } from 'react'
import {
  itemCategoryOptions,
  itemStatusOptions,
} from '../data/itemsDemo'
import type { ItemFilterValues } from '../types'

type ItemsFilterBarProps = {
  filters: ItemFilterValues
  onUpdateFilter: <TKey extends keyof ItemFilterValues>(
    field: TKey,
    value: ItemFilterValues[TKey],
  ) => void
}

export function ItemsFilterBar({
  filters,
  onUpdateFilter,
}: ItemsFilterBarProps) {
  function handleSelectChange<T extends keyof ItemFilterValues>(
    event: ChangeEvent<HTMLSelectElement>,
    field: T,
  ) {
    onUpdateFilter(field, event.target.value as ItemFilterValues[T])
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-end">
      <label className="block lg:w-[250px]">
        <span className="sr-only">بحث باسم الصنف</span>
        <input
          type="search"
          value={filters.search}
          onChange={(event) => onUpdateFilter('search', event.target.value)}
          placeholder="بحث باسم الصنف..."
          className="h-[42px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-300"
        />
      </label>

      <label className="block lg:w-[150px]">
        <span className="sr-only">فلتر القسم</span>
        <select
          value={filters.category}
          onChange={(event) => handleSelectChange(event, 'category')}
          className="h-[42px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-right text-sm text-slate-700 outline-none"
        >
          {itemCategoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block lg:w-[150px]">
        <span className="sr-only">الحالة</span>
        <select
          value={filters.status}
          onChange={(event) => handleSelectChange(event, 'status')}
          className="h-[42px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-right text-sm text-slate-700 outline-none"
        >
          {itemStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
