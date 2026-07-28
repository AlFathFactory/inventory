import type { InputHTMLAttributes } from 'react'

type SearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'type' | 'value'
> & {
  value: string
  onValueChange: (value: string) => void
}

export function SearchInput({
  value,
  onValueChange,
  ...inputProps
}: SearchInputProps) {
  return (
    <input
      {...inputProps}
      type="search"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  )
}
