type CategoryOperationButtonProps = {
  label: string
  color: 'orange' | 'emerald' | 'blue'
  onClick: () => void
}

export function CategoryOperationButton({
  label,
  color,
  onClick,
}: CategoryOperationButtonProps) {
  const colorClass = {
    orange: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
    emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    blue: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
  }[color]

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${colorClass}`}
    >
      {label}
    </button>
  )
}
