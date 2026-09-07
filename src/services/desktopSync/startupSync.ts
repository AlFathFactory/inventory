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
 * already persisted, replay queued commands, then refresh authoritative data.
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

  let replay
  try {
    const { runDesktopQueueReplay } = await import('../desktopQueueReplay')
    replay = await runDesktopQueueReplay()
  } catch (error) {
    return {
      status: 'failed',
      mode: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  if (replay.status === 'succeeded') {
    return replay.syncOutcome
  }
  if (replay.status === 'stopped') {
    return {
      status: 'failed',
      mode: replay.syncOutcome?.status === 'succeeded' ? replay.syncOutcome.mode : null,
      error: replay.error.message,
    }
  }
  if (replay.status === 'failed') {
    return { status: 'failed', mode: null, error: replay.error }
  }

  // Defensive fallback if runtime detection changes during startup.
  return runDesktopSync()
}
