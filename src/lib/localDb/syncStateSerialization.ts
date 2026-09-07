import { SYNC_STATUSES, type SyncStatus } from './models'

/**
 * All conversion between stored metadata strings and typed sync values
 * lives here, so the sync-state API itself stays free of parsing details.
 *
 * The `metadata.value` column is NOT NULL, so "no value" is stored as an
 * empty string and normalized back to `null` on read.
 */

export function nowIso(): string {
  return new Date().toISOString()
}

/** Unknown or absent values fall back to `idle` rather than throwing. */
export function parseSyncStatus(raw: string | undefined): SyncStatus {
  return SYNC_STATUSES.find((status) => status === raw) ?? 'idle'
}

export function parseOptionalText(raw: string | undefined): string | null {
  return raw ? raw : null
}

/** Empty string is the stored representation of "cleared". */
export const CLEARED_VALUE = ''

export function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error) ?? String(error)
  } catch {
    return String(error)
  }
}
