import { isDesktopRuntime } from '../../config/platform'
import { METADATA_KEYS, SYNC_METADATA_KEYS } from './metadataKeys'
import {
  deleteMetadataValues,
  getMetadataValues,
  setMetadataValues,
} from './metadataRepository'
import type { SyncState } from './models'
import {
  CLEARED_VALUE,
  nowIso,
  parseOptionalText,
  parseSyncStatus,
  serializeError,
} from './syncStateSerialization'

const DEFAULT_SYNC_STATE: SyncState = {
  schemaVersion: null,
  status: 'idle',
  cursor: null,
  lastSuccessfulSyncAt: null,
  lastSyncStartedAt: null,
  lastError: null,
}

const READ_KEYS = [METADATA_KEYS.schemaVersion, ...SYNC_METADATA_KEYS]

/**
 * Reads the persisted sync state in a single query. Returns the default
 * state on web (and on a fresh database), so callers never need their own
 * platform branch and never see a partially-populated state.
 */
export async function getSyncState(): Promise<SyncState> {
  if (!isDesktopRuntime()) {
    return DEFAULT_SYNC_STATE
  }
  const values = await getMetadataValues([...READ_KEYS])
  return {
    schemaVersion: parseOptionalText(values.get(METADATA_KEYS.schemaVersion)),
    status: parseSyncStatus(values.get(METADATA_KEYS.syncStatus)),
    cursor: parseOptionalText(values.get(METADATA_KEYS.syncCursor)),
    lastSuccessfulSyncAt: parseOptionalText(values.get(METADATA_KEYS.lastSuccessfulSyncAt)),
    lastSyncStartedAt: parseOptionalText(values.get(METADATA_KEYS.lastSyncStartedAt)),
    lastError: parseOptionalText(values.get(METADATA_KEYS.lastSyncError)),
  }
}

/** Marks a sync attempt as in flight and clears the previous error. */
export async function markSyncStarted(): Promise<void> {
  if (!isDesktopRuntime()) {
    return
  }
  await setMetadataValues({
    [METADATA_KEYS.syncStatus]: 'syncing',
    [METADATA_KEYS.lastSyncStartedAt]: nowIso(),
    [METADATA_KEYS.lastSyncError]: CLEARED_VALUE,
  })
}

/**
 * The only path that advances `last_sync_cursor`. Call it after the local
 * transaction that consumed `nextCursor` has committed, never before.
 */
export async function markSyncSucceeded(nextCursor: string): Promise<void> {
  if (!isDesktopRuntime()) {
    return
  }
  await setMetadataValues({
    [METADATA_KEYS.syncStatus]: 'succeeded',
    [METADATA_KEYS.syncCursor]: nextCursor,
    [METADATA_KEYS.lastSuccessfulSyncAt]: nowIso(),
    [METADATA_KEYS.lastSyncError]: CLEARED_VALUE,
  })
}

/**
 * Records a failed attempt. Deliberately never writes the cursor key, so a
 * failure can never roll back or overwrite the last successful cursor.
 */
export async function markSyncFailed(error: unknown): Promise<void> {
  if (!isDesktopRuntime()) {
    return
  }
  await setMetadataValues({
    [METADATA_KEYS.syncStatus]: 'failed',
    [METADATA_KEYS.lastSyncError]: serializeError(error),
  })
}

/** Resets sync progress. Leaves `schema_version` alone — it is not sync state. */
export async function clearSyncState(): Promise<void> {
  if (!isDesktopRuntime()) {
    return
  }
  await deleteMetadataValues([...SYNC_METADATA_KEYS])
}
