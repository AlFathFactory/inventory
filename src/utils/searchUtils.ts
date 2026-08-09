export function normalizeSearchTerm(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('ar')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replaceAll('ة', 'ه')
    .replaceAll('ى', 'ي')
    .replaceAll('ـ', '')
    .replace(/\s+/g, ' ')
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
