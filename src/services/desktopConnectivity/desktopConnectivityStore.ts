export type DesktopConnectivityState = 'online' | 'offline' | 'checking'

export interface DesktopConnectivitySnapshot {
  state: DesktopConnectivityState
  lastCheckedAt: string | null
  initialized: boolean
}

const INITIAL: DesktopConnectivitySnapshot = {
  state: 'checking',
  lastCheckedAt: null,
  initialized: false,
}

let snapshot = INITIAL
const listeners = new Set<() => void>()

export function getDesktopConnectivitySnapshot() {
  return snapshot
}

export function subscribeToDesktopConnectivity(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setDesktopConnectivitySnapshot(
  patch: Partial<DesktopConnectivitySnapshot>,
) {
  const next = { ...snapshot, ...patch }
  if (
    next.state === snapshot.state
    && next.lastCheckedAt === snapshot.lastCheckedAt
    && next.initialized === snapshot.initialized
  ) return
  snapshot = next
  for (const listener of listeners) listener()
}

export function resetDesktopConnectivitySnapshot() {
  snapshot = INITIAL
  listeners.clear()
}
