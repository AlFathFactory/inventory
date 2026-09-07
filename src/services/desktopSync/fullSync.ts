import { isDesktopRuntime } from '../../config/platform'
import { runSyncPass, type SyncPassResult } from './syncPipeline'

export type FullSyncResult = { status: 'skipped' } | SyncPassResult

/**
 * Runs the initial full sync: a complete snapshot (`since = null`) applied
 * through the shared sync pipeline.
 */
export async function runInitialFullSync(): Promise<FullSyncResult> {
  if (!isDesktopRuntime()) {
    return { status: 'skipped' }
  }
  return runSyncPass(null)
}
