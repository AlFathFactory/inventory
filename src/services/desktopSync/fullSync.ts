import { isDesktopRuntime } from '../../config/platform'
import { runPaginatedSnapshotSync } from './snapshotSync'
import type { SyncPassResult } from './syncPipeline'

export type FullSyncResult = { status: 'skipped' } | SyncPassResult

/**
 * Runs the initial full sync as a paginated snapshot.
 *
 * The single-payload form (`get_inventory_sync_delta_rpc(null)`) built ~11 MB
 * in one statement, cost ~2.7 s of the anon role's 3 s budget and failed
 * roughly half the time, leaving fresh installs with an empty database. Pages
 * cost ~131 ms each instead. Later syncs still use the delta RPC unchanged.
 */
export async function runInitialFullSync(): Promise<FullSyncResult> {
  if (!isDesktopRuntime()) {
    return { status: 'skipped' }
  }

  const result = await runPaginatedSnapshotSync()

  if (result.status === 'failed') {
    return { status: 'failed', error: result.error ?? 'Initial snapshot failed' }
  }

  if (!result.snapshotCursor || !result.rowCounts) {
    return { status: 'failed', error: 'Initial snapshot completed without a cursor' }
  }

  return {
    status: 'succeeded',
    nextCursor: result.snapshotCursor,
    rowCounts: result.rowCounts,
    upsertedRows: result.upsertedRows ?? 0,
    deletedRows: result.deletedRows ?? 0,
  }
}
