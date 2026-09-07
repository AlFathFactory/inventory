/**
 * In-process snapshot of desktop sync status.
 *
 * Deliberately plain (no React, no timers): the coordinator pushes updates as
 * runs start and finish, and the UI subscribes. That keeps the status surface
 * live without any polling or background interval.
 */

export type DesktopSyncPhase = 'idle' | 'syncing' | 'synced' | 'failed'

export interface DesktopSyncSnapshot {
  phase: DesktopSyncPhase
  /** ISO timestamp of the last sync that actually committed. */
  lastSuccessfulSyncAt: string | null
  lastError: string | null
  /** True once the persisted state has been read at least once. */
  hydrated: boolean
}

const INITIAL: DesktopSyncSnapshot = {
  phase: 'idle',
  lastSuccessfulSyncAt: null,
  lastError: null,
  hydrated: false,
}

let snapshot: DesktopSyncSnapshot = INITIAL
const listeners = new Set<() => void>()

export function getDesktopSyncSnapshot(): DesktopSyncSnapshot {
  return snapshot
}

export function subscribeToDesktopSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Replaces the snapshot. Identity only changes when something actually
 * changed, so `useSyncExternalStore` does not re-render on no-op updates.
 */
export function setDesktopSyncSnapshot(patch: Partial<DesktopSyncSnapshot>): void {
  const next = { ...snapshot, ...patch }
  const unchanged =
    next.phase === snapshot.phase &&
    next.lastSuccessfulSyncAt === snapshot.lastSuccessfulSyncAt &&
    next.lastError === snapshot.lastError &&
    next.hydrated === snapshot.hydrated

  if (unchanged) return

  snapshot = next
  for (const listener of listeners) listener()
}

/** Test seam: restores the module to its initial state. */
export function resetDesktopSyncSnapshot(): void {
  snapshot = INITIAL
  listeners.clear()
}
