/**
 * Narrowing helpers for rows coming back from SQLite.
 *
 * The SQL driver hands back `Record<string, unknown>`; every field that
 * reaches a domain type goes through one of these so no raw table row is ever
 * asserted into a shape it does not actually have.
 */

export type LocalRow = Record<string, unknown>

/** TEXT / NULL column. Numbers are stringified the way PostgREST would. */
export function asText(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/**
 * REAL / INTEGER / NULL column. Kept as `number | string | null` because the
 * domain types accept either — Supabase returns numerics as strings for some
 * columns and the UI already copes with both.
 */
export function asNumeric(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value !== '') return value
  return null
}

/** A required numeric, defaulted the way the callers already default it. */
export function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback
}

/** Primary keys are TEXT uuids locally, but the domain types allow numbers. */
export function asId(value: unknown): string | number {
  if (typeof value === 'string' || typeof value === 'number') return value
  return ''
}
