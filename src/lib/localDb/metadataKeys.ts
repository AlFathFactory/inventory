/**
 * Every key stored in the desktop `metadata` table, in one place so the
 * modules that read and write them cannot drift apart.
 */
export const METADATA_KEYS = {
  schemaVersion: 'schema_version',
  syncCursor: 'last_sync_cursor',
  lastSuccessfulSyncAt: 'last_successful_sync_at',
  lastSyncStartedAt: 'last_sync_started_at',
  syncStatus: 'sync_status',
  lastSyncError: 'last_sync_error',
} as const

/** The sync-owned subset — `schema_version` is owned by initialization. */
export const SYNC_METADATA_KEYS = [
  METADATA_KEYS.syncCursor,
  METADATA_KEYS.lastSuccessfulSyncAt,
  METADATA_KEYS.lastSyncStartedAt,
  METADATA_KEYS.syncStatus,
  METADATA_KEYS.lastSyncError,
] as const
