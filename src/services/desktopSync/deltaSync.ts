import { isDesktopRuntime } from '../../config/platform'
import { getSyncState } from '../../lib/localDb/syncState'
import { runSyncPass, type SyncPassResult } from './syncPipeline'

export type DeltaSyncResult =
  | { status: 'skipped' }
  /** No cursor stored yet — the initial full sync has to run first. */
  | { status: 'requires_full_sync' }
  | SyncPassResult

/**
 * Runs one incremental pass using the stored cursor.
 *
 * An empty delta is a normal success: nothing is written, and the cursor
 * still advances once the (empty) transaction commits, so the next pass
 * starts from the newer window. Replaying the same delta is safe because
 * every write is an upsert keyed on `id`.
 *
 * Scheduling is deliberately left to the caller — this runs exactly once.
 */
export async function runDeltaSync(): Promise<DeltaSyncResult> {
  if (!isDesktopRuntime()) {
    return { status: 'skipped' }
  }

  const { cursor } = await getSyncState()
  if (!cursor) {
    return { status: 'requires_full_sync' }
  }

  return runSyncPass(cursor)
}
