import { isDesktopRuntime } from '../../config/platform'
import { withTransaction } from '../../lib/localDb/transaction'
import {
  markSyncFailed,
  markSyncStarted,
  markSyncSucceeded,
} from '../../lib/localDb/syncState'
import { fetchInventorySyncDelta } from './syncClient'
import { parseSyncPayload } from './syncPayload'
import { applySyncSnapshot } from './syncWriter'
import type { SyncTableName } from './syncTables'

export type FullSyncResult =
  | { status: 'skipped' }
  | { status: 'succeeded'; nextCursor: string; rowCounts: Record<SyncTableName, number> }
  | { status: 'failed'; error: string }

/**
 * Runs the initial full sync: pull a complete snapshot from Supabase and
 * apply it to the local database in one transaction.
 *
 * The cursor is only stored after the transaction commits, so a failure at
 * any point leaves the previous cursor untouched and the next run retries
 * the same window.
 */
export async function runInitialFullSync(): Promise<FullSyncResult> {
  if (!isDesktopRuntime()) {
    return { status: 'skipped' }
  }

  await markSyncStarted()

  try {
    const payload = await fetchInventorySyncDelta(null)
    const snapshot = parseSyncPayload(payload)

    await withTransaction((db) => applySyncSnapshot(db, snapshot))

    // Only reached once the transaction has committed.
    await markSyncSucceeded(snapshot.nextCursor)
    return {
      status: 'succeeded',
      nextCursor: snapshot.nextCursor,
      rowCounts: snapshot.rowCounts,
    }
  } catch (error) {
    await markSyncFailed(error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
