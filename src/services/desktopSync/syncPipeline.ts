import { applySyncTransaction } from '../../lib/localDb/transaction'
import {
  markSyncFailed,
  markSyncStarted,
  markSyncSucceeded,
} from '../../lib/localDb/syncState'
import { fetchInventorySyncDelta } from './syncClient'
import { parseSyncPayload } from './syncPayload'
import { buildSyncWritePlan } from './syncWriter'
import type { SyncTableName } from './syncTables'

export type SyncPassResult =
  | {
      status: 'succeeded'
      nextCursor: string
      rowCounts: Record<SyncTableName, number>
      upsertedRows: number
      deletedRows: number
    }
  | { status: 'failed'; error: string }

/**
 * The single sync path, shared by the initial full sync (`since = null`)
 * and every delta pass (`since = last cursor`).
 *
 * Fetch → validate → apply in one Rust-owned transaction → only then store
 * the new cursor. Any failure marks the run failed and leaves the previous
 * cursor in place, so the same window is retried next time.
 */
export async function runSyncPass(since: string | null): Promise<SyncPassResult> {
  await markSyncStarted()

  try {
    const payload = await fetchInventorySyncDelta(since)
    const snapshot = parseSyncPayload(payload)

    // Commits or rolls back entirely before returning.
    const report = await applySyncTransaction(buildSyncWritePlan(snapshot))

    // Reached only after the transaction committed.
    await markSyncSucceeded(snapshot.nextCursor)

    return {
      status: 'succeeded',
      nextCursor: snapshot.nextCursor,
      rowCounts: snapshot.rowCounts,
      upsertedRows: report.upsertedRows,
      deletedRows: report.deletedRows,
    }
  } catch (error) {
    await markSyncFailed(error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
