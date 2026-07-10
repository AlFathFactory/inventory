import type { OperationTypeOption } from '../types'

type OperationTypeCardProps = {
  isActive: boolean
  option: OperationTypeOption
  onClick: () => void
}

export function OperationTypeCard({
  isActive,
  option,
  onClick,
}: OperationTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-[24px] border px-6 py-7 text-right shadow-[var(--app-shadow)] transition',
        isActive
          ? 'border-blue-100 bg-blue-50 text-blue-600'
          : 'border-[var(--app-border)] bg-[var(--app-panel)] text-slate-900 hover:border-blue-100 hover:bg-blue-50/60',
      ].join(' ')}
    >
      <div className="text-[1.05rem] font-bold sm:text-[1.2rem]">{option.title}</div>
      <div className="mt-3 text-sm text-[var(--app-text-muted)]">{option.hint}</div>
    </button>
  )
}
