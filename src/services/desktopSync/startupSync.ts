import { isDesktopRuntime } from '../../config/platform'
import { initializeLocalDb } from '../../lib/localDb'
import { localOfflineCommandQueueRepository } from '../../repositories/local/offlineCommandQueueRepository'
import { runWithDesktopDataMutex } from './desktopDataMutex'
import {
  hydrateDesktopSyncStatus,
  runDesktopSync,
  type DesktopSyncOutcome,
} from './syncCoordinator'
import { setDesktopSyncSnapshot } from './syncStatusStore'

export type StartupSyncResult =
  /** Web runtime, or the local database could not be opened. */
  | { status: 'skipped'; reason: 'web' | 'offline' | 'unavailable'; error?: string }
  | DesktopSyncOutcome

export interface StartupSyncOptions {
  /** False only after the desktop reachability service has confirmed offline. */
  allowNetwork?: boolean
}

/**
 * Desktop startup: open the local database, publish whatever sync state is
 * already persisted, replay queued commands, then refresh authoritative data.
 *
 * This resolves rather than throws in every path. The app must open even if
 * sync fails — the previously synced data stays readable, the cursor is left
 * untouched, and nothing recreates or deletes the database on error.
 */
export async function runStartupSync(
  options: StartupSyncOptions = {},
): Promise<StartupSyncResult> {
  if (!isDesktopRuntime()) {
    return { status: 'skipped', reason: 'web' }
  }

  try {
    await initializeLocalDb()
    await hydrateDesktopSyncStatus()
    // Unconditional: a command stuck mid-flight from a previous crash or
    // force-quit must go back to `pending` even on a launch that never gets
    // to replay it (stays offline the whole session), so it is not silently
    // stuck as `syncing` forever.
    await runWithDesktopDataMutex(
      () => localOfflineCommandQueueRepository.recoverInterruptedCommands(),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setDesktopSyncSnapshot({ phase: 'failed', lastError: message, hydrated: true })
    return { status: 'skipped', reason: 'unavailable', error: message }
  }

  if (options.allowNetwork === false) {
    return { status: 'skipped', reason: 'offline' }
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
