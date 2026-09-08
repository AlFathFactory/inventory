import { isDesktopRuntime } from '../../config/platform'
import {
  getDesktopConnectivitySnapshot,
  startDesktopConnectivity,
  subscribeToDesktopConnectivity,
  type DesktopConnectivityState,
} from '../desktopConnectivity'
import { runDesktopQueueReplay, type QueueReplayOutcome } from '../desktopQueueReplay'
import { runStartupSync, type StartupSyncResult } from '../desktopSync/startupSync'
import {
  MIN_AUTOMATIC_SYNC_INTERVAL_MS,
  type DesktopLifecycleSkipReason,
} from './desktopLifecyclePolicy'

type Cancel = () => void

export type DesktopLifecycleAutoPassOutcome =
  | { status: 'skipped'; reason: DesktopLifecycleSkipReason }
  | { status: 'ran'; replay: QueueReplayOutcome }
  | { status: 'failed'; error: string }

export interface DesktopLifecycleDependencies {
  isDesktop: () => boolean
  isDocumentVisible: () => boolean
  startConnectivity: () => Promise<void>
  getConnectivityState: () => DesktopConnectivityState
  subscribeConnectivity: (listener: () => void) => Cancel
  runStartup: (allowNetwork: boolean) => Promise<StartupSyncResult>
  runQueueReplay: () => Promise<QueueReplayOutcome>
  now: () => Date
  minAutomaticIntervalMs: number
}

/**
 * Owns desktop app-lifecycle orchestration: the startup handshake (delegates
 * to the startup sync module) and, for the rest of the session, one
 * additional automatic trigger — the window regaining focus/visibility while
 * online — layered on top of the connectivity service without touching it.
 *
 * Reconnect (an offline→online transition) keeps its existing, unthrottled
 * behavior inside the connectivity service untouched. This service only adds
 * the *other* case that service does not cover: the window was already
 * online and simply regains focus, which today triggers nothing. That case
 * is throttled by `minAutomaticIntervalMs` so repeated focus events cannot
 * turn into repeated sync traffic; manual refresh and reconnect both call
 * the replay coordinator directly and are never subject to this throttle.
 */
export function createDesktopLifecycleService(dependencies: DesktopLifecycleDependencies) {
  let started = false
  let startInFlight: Promise<StartupSyncResult> | null = null
  let unsubscribeConnectivity: Cancel | null = null
  let lastAutomaticAttemptAt = 0
  let autoPassInFlight: Promise<DesktopLifecycleAutoPassOutcome> | null = null

  function recordAutomaticAttempt(): void {
    lastAutomaticAttemptAt = dependencies.now().getTime()
  }

  function withinMinInterval(): boolean {
    return dependencies.now().getTime() - lastAutomaticAttemptAt < dependencies.minAutomaticIntervalMs
  }

  /**
   * The one automatic (non-manual, non-startup, non-reconnect) sync trigger.
   * A second call while one is already running gets the same promise rather
   * than starting a competing pass — this is how repeated focus events
   * collapse into one, on top of the mutex the replay coordinator already
   * holds for the pass itself.
   */
  function runAutomaticPass(): Promise<DesktopLifecycleAutoPassOutcome> {
    if (autoPassInFlight) {
      return autoPassInFlight
    }
    if (!dependencies.isDesktop()) {
      return Promise.resolve({ status: 'skipped', reason: 'web' })
    }
    if (!dependencies.isDocumentVisible()) {
      return Promise.resolve({ status: 'skipped', reason: 'hidden' })
    }
    if (dependencies.getConnectivityState() !== 'online') {
      return Promise.resolve({ status: 'skipped', reason: 'offline' })
    }
    if (withinMinInterval()) {
      return Promise.resolve({ status: 'skipped', reason: 'throttled' })
    }

    recordAutomaticAttempt()
    autoPassInFlight = dependencies.runQueueReplay()
      .then((replay): DesktopLifecycleAutoPassOutcome => ({ status: 'ran', replay }))
      .catch((error: unknown): DesktopLifecycleAutoPassOutcome => ({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }))
      .finally(() => {
        autoPassInFlight = null
      })
    return autoPassInFlight
  }

  function handleConnectivityChange(): void {
    if (dependencies.getConnectivityState() === 'online') {
      void runAutomaticPass()
    }
  }

  /**
   * Desktop startup: hands off to the startup sync module (DB init,
   * unconditional command recovery, and replay+sync if online), then starts
   * listening for the ongoing focus/visibility trigger for the rest of the
   * session. Never throws — the app must open regardless of what this
   * resolves to.
   */
  function start(): Promise<StartupSyncResult> {
    if (!dependencies.isDesktop()) {
      return Promise.resolve({ status: 'skipped', reason: 'web' })
    }
    if (started) {
      return startInFlight ?? Promise.resolve({ status: 'skipped', reason: 'web' })
    }
    started = true

    startInFlight = (async () => {
      try {
        await dependencies.startConnectivity()
      } catch {
        // Connectivity monitoring failing must not block startup or the
        // replay/sync attempt below — treat reachability as unconfirmed.
      }

      const allowNetwork = dependencies.getConnectivityState() !== 'offline'
      const result = await dependencies.runStartup(allowNetwork)
      // Startup itself counts as an attempt, so a focus event landing right
      // after it finishes does not immediately fire a redundant pass.
      recordAutomaticAttempt()

      unsubscribeConnectivity = dependencies.subscribeConnectivity(handleConnectivityChange)
      return result
    })().finally(() => {
      startInFlight = null
    })

    return startInFlight
  }

  function stop(): void {
    unsubscribeConnectivity?.()
    unsubscribeConnectivity = null
    started = false
    startInFlight = null
    lastAutomaticAttemptAt = 0
    autoPassInFlight = null
  }

  return {
    start,
    stop,
    runAutomaticPass,
    isAutomaticPassRunning: () => autoPassInFlight !== null,
  }
}

const productionService = createDesktopLifecycleService({
  isDesktop: isDesktopRuntime,
  isDocumentVisible: () => document.visibilityState === 'visible',
  startConnectivity: startDesktopConnectivity,
  getConnectivityState: () => getDesktopConnectivitySnapshot().state,
  subscribeConnectivity: subscribeToDesktopConnectivity,
  runStartup: (allowNetwork) => runStartupSync({ allowNetwork }),
  runQueueReplay: runDesktopQueueReplay,
  now: () => new Date(),
  minAutomaticIntervalMs: MIN_AUTOMATIC_SYNC_INTERVAL_MS,
})

export const startDesktopLifecycle = productionService.start
export const stopDesktopLifecycle = productionService.stop
export const runDesktopLifecycleAutomaticPass = productionService.runAutomaticPass
export const isDesktopLifecycleAutomaticPassRunning = productionService.isAutomaticPassRunning
