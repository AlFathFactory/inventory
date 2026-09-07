export const SYNC_STATUSES = ['idle', 'syncing', 'succeeded', 'failed'] as const

export type SyncStatus = (typeof SYNC_STATUSES)[number]

/** Parsed view of the sync-related rows in the desktop `metadata` table. */
export interface SyncState {
  /** Owned by database initialization, surfaced here as read-only context. */
  schemaVersion: string | null
  status: SyncStatus
  /** Only ever advanced by a successful sync. */
  cursor: string | null
  lastSuccessfulSyncAt: string | null
  lastSyncStartedAt: string | null
  lastError: string | null
}
