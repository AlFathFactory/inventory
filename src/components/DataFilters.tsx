import { useEffect, useMemo, useRef, useState } from 'react'

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

function formatDateLabel(value: string) {
  if (!value) {
    return ''
  }

  const [year, month, day] = value.split('-')

  if (!year || !month || !day) {
    return value
  }

  return `${day}/${month}/${year}`
}

function parseDateValue(value: string) {
  if (!value) {
    return null
  }

  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) {
    return null
  }

  return new Date(year, month - 1, day)
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1)
}

function toDateValue(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function buildCalendarDays(month: Date) {
  const firstDay = startOfMonth(month)
  const firstWeekday = firstDay.getDay()
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(
      month.getFullYear(),
      month.getMonth(),
      index - firstWeekday + 1,
    )

    return {
      value: toDateValue(date),
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === month.getMonth(),
    }
  })
}

function formatMonthLabel(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(value)
}

function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [draftStartDate, setDraftStartDate] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()))
  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonth),
    [visibleMonth],
  )
  const displayValue =
    value.fromDate && value.toDate
      ? value.fromDate === value.toDate
        ? formatDateLabel(value.fromDate)
        : `${formatDateLabel(value.fromDate)} - ${formatDateLabel(value.toDate)}`
      : draftStartDate
        ? `ابدأ من ${formatDateLabel(draftStartDate)}`
        : 'اختر يومًا أو فترة'
  const helperText =
    value.fromDate && value.toDate
      ? value.fromDate === value.toDate
        ? 'نقرتان لاختيار يوم واحد'
        : 'تم تحديد فترة تاريخ'
      : draftStartDate
        ? 'اختر التاريخ الثاني لإكمال الفترة'
        : 'انقر مرة لبدء الفترة أو نقرتين لاختيار يوم واحد'

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen])

  useEffect(() => {
    const activeDate = value.fromDate || draftStartDate
    const parsedDate = parseDateValue(activeDate)

    if (parsedDate) {
      setVisibleMonth(startOfMonth(parsedDate))
    }
  }, [draftStartDate, value.fromDate])

  function handleDayClick(nextDateValue: string) {
    if (!draftStartDate || (value.fromDate && value.toDate)) {
      setDraftStartDate(nextDateValue)
      onChange({ fromDate: '', toDate: '' })
      return
    }

    if (nextDateValue < draftStartDate) {
      onChange({ fromDate: nextDateValue, toDate: draftStartDate })
    } else if (nextDateValue > draftStartDate) {
      onChange({ fromDate: draftStartDate, toDate: nextDateValue })
    } else {
      onChange({ fromDate: nextDateValue, toDate: nextDateValue })
    }

    setDraftStartDate('')
  }

  function handleDayDoubleClick(nextDateValue: string) {
    setDraftStartDate('')
    onChange({ fromDate: nextDateValue, toDate: nextDateValue })
    setIsOpen(false)
  }

  function handleClear() {
    setDraftStartDate('')
    onChange({ fromDate: '', toDate: '' })
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="rounded-[24px] border border-[var(--app-border)] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-right">
            <span className="block text-sm font-medium text-slate-700">
              فلتر التاريخ
            </span>
            <p className="mt-1 text-xs text-[var(--app-text-muted)]">
              {helperText}
            </p>
          </div>

          <button
            type="button"
            onClick={handleClear}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--app-border)] px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            مسح
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((currentValue) => !currentValue)}
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] px-4 py-3 text-right transition hover:border-slate-300"
        >
          <span className="text-sm text-slate-900">{displayValue}</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4" />
              <path d="M8 2v4" />
              <path d="M3 10h18" />
            </svg>
          </span>
        </button>
      </div>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+12px)] z-30 rounded-[28px] border border-[var(--app-border)] bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setVisibleMonth((currentValue) => addMonths(currentValue, -1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>

            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-700">
              {formatMonthLabel(visibleMonth)}
            </div>

            <button
              type="button"
              onClick={() => setVisibleMonth((currentValue) => addMonths(currentValue, 1))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-y-2 text-center text-xs font-medium text-slate-500">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((dayLabel) => (
              <div key={dayLabel} className="py-2">
                {dayLabel}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-y-2 text-center">
            {calendarDays.map((day) => {
              const isRangeStart = Boolean(value.fromDate) && value.fromDate === day.value
              const isRangeEnd = Boolean(value.toDate) && value.toDate === day.value
              const isSingleDay =
                Boolean(value.fromDate && value.toDate) &&
                value.fromDate === value.toDate
              const isDraftStart = draftStartDate === day.value
              const isInRange =
                Boolean(value.fromDate && value.toDate) &&
                value.fromDate <= day.value &&
                day.value <= value.toDate
              const showHighlight = isInRange && !isSingleDay

              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => handleDayClick(day.value)}
                  onDoubleClick={() => handleDayDoubleClick(day.value)}
                  className={[
                    'relative h-11 text-sm transition',
                    day.isCurrentMonth ? 'text-slate-800' : 'text-slate-300',
                    showHighlight ? 'bg-blue-100/90' : 'hover:bg-slate-50',
                    isRangeStart ? 'rounded-r-full' : '',
                    isRangeEnd ? 'rounded-l-full' : '',
                    isRangeStart && isRangeEnd ? 'rounded-full' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mx-auto flex h-9 w-9 items-center justify-center rounded-full',
                      isRangeStart || isRangeEnd || isDraftStart
                        ? 'bg-[var(--app-primary)] font-semibold text-white shadow-sm'
                        : '',
                    ].join(' ')}
                  >
                    {day.dayNumber}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
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
    <div
      className={[
        'grid gap-4 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4',
        showDateFilter ? 'md:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]' : 'md:grid-cols-1',
      ].join(' ')}
    >
      <label className="space-y-2">
        <span className="block text-sm font-medium text-slate-700">بحث</span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-2xl border border-[var(--app-border)] bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
        />
      </label>

      {showDateFilter && onDateRangeChange ? (
        <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
      ) : null}
    </div>
  )
}
