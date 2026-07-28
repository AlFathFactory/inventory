export function normalizeSearchTerm(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replaceAll('ة', 'ه')
    .replaceAll('ى', 'ي')
}

export function includesSearchTerm(
  value: unknown,
  normalizedSearchTerm: string,
): boolean {
  return normalizeSearchTerm(String(value ?? '')).includes(normalizedSearchTerm)
}

export function matchesAnySearchValue(
  values: readonly unknown[],
  normalizedSearchTerm: string,
): boolean {
  return normalizedSearchTerm === ''
    || values.some((value) => includesSearchTerm(value, normalizedSearchTerm))
}
