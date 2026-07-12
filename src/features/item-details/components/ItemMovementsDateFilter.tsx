type ItemMovementsDateFilterProps = {
  fromDate: string
  toDate: string
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
  onClear: () => void
}

function inputClassName() {
  return 'h-[46px] w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-[var(--app-primary)]'
}

export function ItemMovementsDateFilter({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onClear,
}: ItemMovementsDateFilterProps) {
  const hasActiveFilters = Boolean(fromDate || toDate)

  return (
    <div className="rounded-[28px] border border-[var(--app-border)] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-4 md:grid-cols-2">
          <label className="text-right">
            <span className="mb-2 block text-sm font-medium text-slate-700">من تاريخ</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => onFromDateChange(event.target.value)}
              className={inputClassName()}
            />
          </label>

          <label className="text-right">
            <span className="mb-2 block text-sm font-medium text-slate-700">إلى تاريخ</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => onToDateChange(event.target.value)}
              className={inputClassName()}
            />
          </label>
        </div>

        <button
          type="button"
          onClick={onClear}
          disabled={!hasActiveFilters}
          className="inline-flex h-[46px] items-center justify-center rounded-2xl border border-[var(--app-border)] px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          مسح الفلتر
        </button>
      </div>
    </div>
  )
}
