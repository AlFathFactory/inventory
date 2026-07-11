type InventoryDateCellProps = {
  dateLabel: string
  hasAdded: boolean
  hasIssued: boolean
}

export function hasNonZeroValue(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0
  }

  if (typeof value === 'string') {
    const normalizedValue = Number(value)
    return Number.isFinite(normalizedValue) && normalizedValue !== 0
  }

  return false
}

export function InventoryDateCell({
  dateLabel,
  hasAdded,
  hasIssued,
}: InventoryDateCellProps) {
  const shouldShowIndicators = hasAdded || hasIssued

  return (
    <div className="inline-flex items-center gap-2 whitespace-nowrap">
      <span>{dateLabel}</span>
      {shouldShowIndicators ? (
        <span className="inline-flex items-center gap-1.5">
          {hasAdded ? (
            <span
              aria-label="إضافة"
              className="h-2.5 w-2.5 rounded-full bg-emerald-500"
            />
          ) : null}
          {hasIssued ? (
            <span
              aria-label="صرف"
              className="h-2.5 w-2.5 rounded-full bg-orange-500"
            />
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
