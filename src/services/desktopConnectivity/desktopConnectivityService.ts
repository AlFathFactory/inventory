import { isDesktopRuntime } from '../../config/platform'
import { probeSupabaseReachability } from '../connectivityService'
import { runDesktopQueueReplay } from '../desktopQueueReplay'
import {
  setDesktopConnectivitySnapshot,
  type DesktopConnectivityState,
} from './desktopConnectivityStore'

export const CONNECTIVITY_RECHECK_DEBOUNCE_MS = 750
export const CONNECTIVITY_VISIBLE_INTERVAL_MS = 60_000
export const CONNECTIVITY_PROBE_TIMEOUT_MS = 5_000

type Cancel = () => void

export interface DesktopConnectivityDependencies {
  isDesktop: () => boolean
  isBrowserOnline: () => boolean
  isDocumentVisible: () => boolean
  probeBackend: (force: boolean) => Promise<boolean>
  replayPending: () => Promise<unknown>
  publish: (snapshot: {
    state: DesktopConnectivityState
    lastCheckedAt?: string
    initialized?: boolean
  }) => void
  now: () => Date
  listenOnline: (listener: () => void) => Cancel
  listenOffline: (listener: () => void) => Cancel
  listenVisibility: (listener: () => void) => Cancel
  schedule: (listener: () => void, delayMs: number) => Cancel
  repeat: (listener: () => void, intervalMs: number) => Cancel
}

export function createDesktopConnectivityService(
  dependencies: DesktopConnectivityDependencies,
) {
  let started = false
  let startInFlight: Promise<void> | null = null
  let confirmedState: 'online' | 'offline' | null = null
  let probeInFlight: Promise<void> | null = null
  let replayInFlight: Promise<unknown> | null = null
  let cancelScheduledCheck: Cancel | null = null
  let cleanup: Cancel[] = []

  function publishChecking() {
    dependencies.publish({ state: 'checking' })
  }

  function publishConfirmed(state: 'online' | 'offline') {
    confirmedState = state
    dependencies.publish({
      state,
      lastCheckedAt: dependencies.now().toISOString(),
      initialized: true,
    })
  }

  function replayOnce() {
    if (replayInFlight) return replayInFlight
    replayInFlight = dependencies.replayPending().finally(() => {
      replayInFlight = null
    })
    return replayInFlight
  }

  function checkNow(force = false): Promise<void> {
    if (probeInFlight) return probeInFlight

    publishChecking()
    probeInFlight = dependencies.probeBackend(force)
      .then((reachable) => {
        const previous = confirmedState
        publishConfirmed(reachable ? 'online' : 'offline')
        if (reachable && previous === 'offline') {
          void replayOnce().catch(() => {
            // Reachability is still confirmed; replay owns and reports its own failure state.
          })
        }
      })
      .catch(() => {
        publishConfirmed('offline')
      })
      .finally(() => {
        probeInFlight = null
      })
    return probeInFlight
  }

  function scheduleCheck(force: boolean) {
    cancelScheduledCheck?.()
    publishChecking()
    cancelScheduledCheck = dependencies.schedule(() => {
      cancelScheduledCheck = null
      void checkNow(force)
    }, CONNECTIVITY_RECHECK_DEBOUNCE_MS)
  }

  function handleOffline() {
    scheduleCheck(true)
  }

  function handleOnline() {
    scheduleCheck(true)
  }

  function handleVisibility() {
    if (dependencies.isDocumentVisible()) {
      scheduleCheck(!dependencies.isBrowserOnline())
    }
  }

  function start(): Promise<void> {
    if (!dependencies.isDesktop() || started) {
      return startInFlight ?? Promise.resolve()
    }
    started = true
    cleanup = [
      dependencies.listenOnline(handleOnline),
      dependencies.listenOffline(handleOffline),
      dependencies.listenVisibility(handleVisibility),
      dependencies.repeat(() => {
        if (dependencies.isDocumentVisible()) {
          scheduleCheck(!dependencies.isBrowserOnline())
        }
      }, CONNECTIVITY_VISIBLE_INTERVAL_MS),
    ]
    startInFlight = checkNow(true).finally(() => {
      startInFlight = null
    })
    return startInFlight
  }

  function stop() {
    cancelScheduledCheck?.()
    cancelScheduledCheck = null
    for (const cancel of cleanup) cancel()
    cleanup = []
    started = false
    startInFlight = null
  }

  return { start, stop, checkNow }
}

function listenWindow(type: 'online' | 'offline', listener: () => void) {
  window.addEventListener(type, listener)
  return () => window.removeEventListener(type, listener)
}

const productionService = createDesktopConnectivityService({
  isDesktop: isDesktopRuntime,
  isBrowserOnline: () => navigator.onLine,
  isDocumentVisible: () => document.visibilityState === 'visible',
  probeBackend: (force) => probeSupabaseReachability({
    force,
    timeoutMs: CONNECTIVITY_PROBE_TIMEOUT_MS,
    ignoreNavigatorHint: true,
  }),
  replayPending: runDesktopQueueReplay,
  publish: setDesktopConnectivitySnapshot,
  now: () => new Date(),
  listenOnline: (listener) => listenWindow('online', listener),
  listenOffline: (listener) => listenWindow('offline', listener),
  listenVisibility: (listener) => {
    document.addEventListener('visibilitychange', listener)
    return () => document.removeEventListener('visibilitychange', listener)
  },
  schedule: (listener, delayMs) => {
    const timer = window.setTimeout(listener, delayMs)
    return () => window.clearTimeout(timer)
  },
  repeat: (listener, intervalMs) => {
    const timer = window.setInterval(listener, intervalMs)
    return () => window.clearInterval(timer)
  },
})

export const startDesktopConnectivity = productionService.start
export const stopDesktopConnectivity = productionService.stop
export const recheckDesktopConnectivity = productionService.checkNow
