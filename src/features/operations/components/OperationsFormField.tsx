import type { ReactNode } from 'react'

type OperationsFormFieldProps = {
  children: ReactNode
  className?: string
}

export function OperationsFormField({
  children,
  className = '',
}: OperationsFormFieldProps) {
  return (
    <div
      className={[
        'flex h-[42px] items-center rounded-2xl border border-[var(--app-border)] bg-white px-4 text-sm text-slate-700',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}
