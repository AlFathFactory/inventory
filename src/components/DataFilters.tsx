export type DateRangeValue = {
  fromDate: string
  toDate: string
}

type DataFiltersProps = {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  showDateFilter?: boolean
  dateRange?: DateRangeValue
  onDateRangeChange?: (value: DateRangeValue) => void
}

function inputClassName() {
  return 'w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400'
}

export function DataFilters({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'ابحث داخل الجدول',
  showDateFilter = false,
  dateRange = { fromDate: '', toDate: '' },
  onDateRangeChange,
}: DataFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4">
      <label className="min-w-[240px] flex-1 space-y-2">
        <span className="block text-sm font-medium text-slate-700">بحث</span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className={inputClassName()}
        />
      </label>

      {showDateFilter && onDateRangeChange ? (
        <>
          <label className="min-w-[180px] flex-[0_1_220px] space-y-2">
            <span className="block text-sm font-medium text-slate-700">من تاريخ</span>
            <input
              type="date"
              value={dateRange.fromDate}
              onChange={(event) =>
                onDateRangeChange({
                  fromDate: event.target.value,
                  toDate: dateRange.toDate,
                })
              }
              className={inputClassName()}
            />
          </label>

          <label className="min-w-[180px] flex-[0_1_220px] space-y-2">
            <span className="block text-sm font-medium text-slate-700">إلى تاريخ</span>
            <input
              type="date"
              value={dateRange.toDate}
              onChange={(event) =>
                onDateRangeChange({
                  fromDate: dateRange.fromDate,
                  toDate: event.target.value,
                })
              }
              className={inputClassName()}
            />
          </label>

          <div className="flex min-w-[110px] items-end">
            <button
              type="button"
              onClick={() => onDateRangeChange({ fromDate: '', toDate: '' })}
              className="inline-flex h-[42px] w-full items-center justify-center rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 md:w-auto md:min-w-[110px]"
            >
              مسح
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
