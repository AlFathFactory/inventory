import { isDesktopRuntime } from '../../config/platform'
import { getSyncState } from '../../lib/localDb/syncState'
import type { SyncPassResult } from './syncPipeline'
import { setDesktopSyncSnapshot } from './syncStatusStore'
import { runWithDesktopDataMutex } from './desktopDataMutex'

/**
 * The sync pipeline (and the Tauri APIs behind it) is imported on demand, so
 * the web entry chunk never pulls it in.
 */
const loadFullSync = () => import('./fullSync').then((module) => module.runInitialFullSync())
const loadDeltaSync = () => import('./deltaSync').then((module) => module.runDeltaSync())

export type DesktopSyncMode = 'full' | 'delta'

export type DesktopSyncOutcome =
  /** Web runtime: desktop sync never runs there. */
  | { status: 'skipped' }
  | ({ status: 'succeeded'; mode: DesktopSyncMode } & Omit<
      Extract<SyncPassResult, { status: 'succeeded' }>,
      'status'
    >)
  | { status: 'failed'; mode: DesktopSyncMode | null; error: string }

/**
 * The one in-process guard. A second call while a run is in flight gets the
 * same promise rather than starting a competing pass, so a double-clicked
 * refresh (or a refresh landing on top of the startup sync) can never issue
 * two overlapping syncs against the same cursor.
 */
let inFlight: Promise<DesktopSyncOutcome> | null = null

/**
 * Runs one sync pass, choosing the mode from the stored cursor: no cursor
 * means this machine has never synced, so a full snapshot is pulled;
 * otherwise an incremental delta.
 *
 * Never throws — failures come back as a typed outcome so callers (startup
 * included) can carry on with whatever is already in the local database.
 */
export function runDesktopSync(): Promise<DesktopSyncOutcome> {
  if (!isDesktopRuntime()) {
    return Promise.resolve({ status: 'skipped' })
  }
  if (inFlight) {
    return inFlight
  }

  inFlight = runWithDesktopDataMutex(() => executeSyncPass()).finally(() => {
    inFlight = null
  })

  return inFlight
}

/**
 * Refreshes authoritative state immediately after replay. It prefers delta,
 * but safely falls back to full sync if this database has no cursor yet.
 */
export function runDesktopDeltaAfterReplay(): Promise<DesktopSyncOutcome> {
  if (!isDesktopRuntime()) {
    return Promise.resolve({ status: 'skipped' })
  }
  if (inFlight) {
    return inFlight
  }

  inFlight = runWithDesktopDataMutex(() => executeSyncPass('delta')).finally(() => {
    inFlight = null
  })
  return inFlight
}

/** True while a pass is running; used by the status surface. */
export function isDesktopSyncRunning(): boolean {
  return inFlight !== null
}

async function executeSyncPass(preferredMode?: 'delta'): Promise<DesktopSyncOutcome> {
  setDesktopSyncSnapshot({ phase: 'syncing', lastError: null })

  let mode: DesktopSyncMode | null = null
  try {
    const { cursor } = await getSyncState()
    mode = preferredMode ?? (cursor ? 'delta' : 'full')

    let result = mode === 'delta' ? await loadDeltaSync() : await loadFullSync()

    // The cursor can legitimately be absent by the time the delta reads it
    // (a cleared state, or a first run racing this one). Fall through to a
    // full snapshot rather than reporting a failure.
    if (result.status === 'requires_full_sync') {
      mode = 'full'
      result = await loadFullSync()
    }

    if (result.status === 'skipped') {
      return { status: 'skipped' }
    }

    if (result.status === 'failed') {
      return failure(mode, result.error)
    }

    const { status: _status, ...pass } = result
    setDesktopSyncSnapshot({
      phase: 'synced',
      lastSuccessfulSyncAt: new Date().toISOString(),
      lastError: null,
    })
    return { status: 'succeeded', mode, ...pass }
  } catch (error) {
    // `runSyncPass` already records its own failures; this covers everything
    // around it (reading state, an unavailable local database).
    return failure(mode, error instanceof Error ? error.message : String(error))
  }
}

function failure(mode: DesktopSyncMode | null, error: string): DesktopSyncOutcome {
  setDesktopSyncSnapshot({ phase: 'failed', lastError: error })
  return { status: 'failed', mode, error }
}

/**
 * Publishes the persisted sync state into the in-process snapshot, so the
 * status surface shows the real last-success time immediately on open
 * instead of waiting for the first pass to finish.
 */
export async function hydrateDesktopSyncStatus(): Promise<void> {
  if (!isDesktopRuntime()) return

  const state = await getSyncState()
  setDesktopSyncSnapshot({
    // A run interrupted by a previous shutdown is not still running now.
    phase:
      state.status === 'succeeded'
        ? 'synced'
        : state.status === 'failed'
          ? 'failed'
          : 'idle',
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
    lastError: state.lastError,
    hydrated: true,
  })
}

/** Test seam: drops any retained in-flight promise. */
export function resetDesktopSyncGuard(): void {
  inFlight = null
}
