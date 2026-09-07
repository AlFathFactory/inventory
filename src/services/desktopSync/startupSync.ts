import { isDesktopRuntime } from '../../config/platform'
import { initializeLocalDb } from '../../lib/localDb'
import {
  hydrateDesktopSyncStatus,
  runDesktopSync,
  type DesktopSyncOutcome,
} from './syncCoordinator'
import { setDesktopSyncSnapshot } from './syncStatusStore'

export type StartupSyncResult =
  /** Web runtime, or the local database could not be opened. */
  | { status: 'skipped'; reason: 'web' | 'unavailable'; error?: string }
  | DesktopSyncOutcome

/**
 * Desktop startup: open the local database, publish whatever sync state is
 * already persisted, then run one pass (full on first launch, delta after).
 *
 * This resolves rather than throws in every path. The app must open even if
 * sync fails — the previously synced data stays readable, the cursor is left
 * untouched, and nothing recreates or deletes the database on error.
 */
export async function runStartupSync(): Promise<StartupSyncResult> {
  if (!isDesktopRuntime()) {
    return { status: 'skipped', reason: 'web' }
  }

  try {
    await initializeLocalDb()
    await hydrateDesktopSyncStatus()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setDesktopSyncSnapshot({ phase: 'failed', lastError: message, hydrated: true })
    return { status: 'skipped', reason: 'unavailable', error: message }
  }

  return runDesktopSync()
}
