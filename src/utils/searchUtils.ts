export function normalizeSearchTerm(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function includesSearchTerm(
  value: unknown,
  normalizedSearchTerm: string,
): boolean {
  return String(value ?? '').toLocaleLowerCase().includes(normalizedSearchTerm)
}

export function matchesAnySearchValue(
  values: readonly unknown[],
  normalizedSearchTerm: string,
): boolean {
  return normalizedSearchTerm === ''
    || values.some((value) => includesSearchTerm(value, normalizedSearchTerm))
}
