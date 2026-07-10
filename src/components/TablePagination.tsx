type TablePaginationProps = {
  currentPage: number
  pageSize: number
  totalItems: number
  totalPages: number
  pageStart: number
  pageEnd: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

const pageSizeOptions = [5, 10, 20, 50]

export function TablePagination({
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  pageStart,
  pageEnd,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  if (totalItems === 0) {
    return null
  }

  const canGoPrevious = currentPage > 1
  const canGoNext = currentPage < totalPages

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          عرض {pageStart}-{pageEnd} من {totalItems}
        </span>
        <label className="flex items-center gap-2">
          <span>لكل صفحة</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-9 rounded-xl border border-[var(--app-border)] bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!canGoPrevious}
          className="inline-flex h-9 min-w-[88px] items-center justify-center rounded-xl border border-[var(--app-border)] bg-white px-4 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          السابق
        </button>
        <span className="min-w-[72px] text-center text-slate-700">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!canGoNext}
          className="inline-flex h-9 min-w-[88px] items-center justify-center rounded-xl border border-[var(--app-border)] bg-white px-4 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          التالي
        </button>
      </div>
    </div>
  )
}
