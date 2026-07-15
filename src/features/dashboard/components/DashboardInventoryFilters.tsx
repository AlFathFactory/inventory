import { categoryOptions } from '../../../config/categoryConfig'

type DashboardInventoryFiltersProps = {
  searchValue: string
  categoryValue: string
  projectValue: string
  projectOptions: string[]
  fromDate: string
  toDate: string
  onSearchChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onProjectChange: (value: string) => void
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
  onClear: () => void
}

function inputClassName() {
  return 'h-11 w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400'
}

export function DashboardInventoryFilters({
  searchValue,
  categoryValue,
  projectValue,
  projectOptions,
  fromDate,
  toDate,
  onSearchChange,
  onCategoryChange,
  onProjectChange,
  onFromDateChange,
  onToDateChange,
  onClear,
}: DashboardInventoryFiltersProps) {
  return (
    <div className="grid gap-4 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(180px,0.65fr)_minmax(180px,0.65fr)_minmax(150px,0.5fr)_minmax(150px,0.5fr)_auto]">
      <label className="space-y-2">
        <span className="block text-sm font-medium text-slate-700">بحث</span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="ابحث في القسم أو الصنف أو المشروع أو أي بيانات مرتبطة"
          className={inputClassName()}
        />
      </label>

      <label className="space-y-2">
        <span className="block text-sm font-medium text-slate-700">المشروع</span>
        <select
          value={projectValue}
          onChange={(event) => onProjectChange(event.target.value)}
          className={inputClassName()}
        >
          <option value="all">كل المشاريع</option>
          {projectOptions.map((projectName) => (
            <option key={projectName} value={projectName}>{projectName}</option>
          ))}
        </select>
      </label>

      <label className="space-y-2">
        <span className="block text-sm font-medium text-slate-700">القسم</span>
        <select
          value={categoryValue}
          onChange={(event) => onCategoryChange(event.target.value)}
          className={inputClassName()}
        >
          <option value="all">كل الأقسام</option>
          {categoryOptions.map((category) => (
            <option key={category.key} value={category.key}>
              {category.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-2">
        <span className="block text-sm font-medium text-slate-700">من تاريخ</span>
        <input
          type="date"
          value={fromDate}
          onChange={(event) => onFromDateChange(event.target.value)}
          className={inputClassName()}
        />
      </label>

      <label className="space-y-2">
        <span className="block text-sm font-medium text-slate-700">إلى تاريخ</span>
        <input
          type="date"
          value={toDate}
          onChange={(event) => onToDateChange(event.target.value)}
          className={inputClassName()}
        />
      </label>

      <div className="flex items-end">
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 lg:w-auto lg:min-w-[120px]"
        >
          مسح الفلاتر
        </button>
      </div>
    </div>
  )
}
