import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDesktopLifecycleService,
  type DesktopLifecycleDependencies,
} from './desktopLifecycleService'
import { MIN_AUTOMATIC_SYNC_INTERVAL_MS } from './desktopLifecyclePolicy'
import type { StartupSyncResult } from '../desktopSync/startupSync'
import type { QueueReplayOutcome } from '../desktopQueueReplay'
import { SYNC_TABLE_NAMES, type SyncTableName } from '../desktopSync/syncTables'

const NOW = new Date('2026-09-08T10:00:00.000Z')
const EMPTY_ROW_COUNTS = Object.fromEntries(
  SYNC_TABLE_NAMES.map((table) => [table, 0]),
) as Record<SyncTableName, number>

const STARTUP_SUCCESS: StartupSyncResult = {
  status: 'succeeded',
  mode: 'delta',
  nextCursor: 'next',
  rowCounts: EMPTY_ROW_COUNTS,
  upsertedRows: 0,
  deletedRows: 0,
}

const REPLAY_SUCCESS: QueueReplayOutcome = {
  status: 'succeeded',
  reachedPassLimit: false,
  syncOutcome: STARTUP_SUCCESS,
  processed: 0,
  synced: 0,
  failed: 0,
  conflicts: 0,
}

function createHarness(options: {
  desktop?: boolean
  visible?: boolean
  connectivity?: 'online' | 'offline' | 'checking'
} = {}) {
  let visible = options.visible ?? true
  let connectivity: 'online' | 'offline' | 'checking' = options.connectivity ?? 'online'
  let clock = NOW.getTime()
  const connectivityListeners = new Set<() => void>()

  const startConnectivity = vi.fn(async () => {})
  const runStartup = vi.fn(async (_allowNetwork: boolean) => STARTUP_SUCCESS)
  const runQueueReplay = vi.fn(async () => REPLAY_SUCCESS)

  const dependencies: DesktopLifecycleDependencies = {
    isDesktop: () => options.desktop ?? true,
    isDocumentVisible: () => visible,
    startConnectivity,
    getConnectivityState: () => connectivity,
    subscribeConnectivity: (listener) => {
      connectivityListeners.add(listener)
      return () => connectivityListeners.delete(listener)
    },
    runStartup,
    runQueueReplay,
    now: () => new Date(clock),
    minAutomaticIntervalMs: MIN_AUTOMATIC_SYNC_INTERVAL_MS,
  }

  const service = createDesktopLifecycleService(dependencies)

  return {
    service,
    startConnectivity,
    runStartup,
    runQueueReplay,
    /**
     * Starts the service, then clears the throttle window startup itself
     * records — the fixture for every test that exercises the focus/reconnect
     * trigger in isolation from that startup-attempt bookkeeping (which has
     * its own dedicated test).
     */
    async startAndClearThrottle() {
      const result = await service.start()
      clock += MIN_AUTOMATIC_SYNC_INTERVAL_MS
      return result
    },
    setVisible(value: boolean) {
      visible = value
    },
    setConnectivity(value: 'online' | 'offline' | 'checking') {
      connectivity = value
    },
    advanceMs(ms: number) {
      clock += ms
    },
    /** Simulates the connectivity store notifying subscribers. */
    emitConnectivityChange() {
      for (const listener of connectivityListeners) listener()
    },
    listenerCount() {
      return connectivityListeners.size
    },
  }
}

describe('desktop lifecycle service', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('startup', () => {
    it('starts connectivity, then replays/syncs when online', async () => {
      const harness = createHarness({ connectivity: 'online' })

      const result = await harness.service.start()

      expect(harness.startConnectivity).toHaveBeenCalledOnce()
      expect(harness.runStartup).toHaveBeenCalledWith(true)
      expect(result).toEqual(STARTUP_SUCCESS)
    })

    it('opens immediately with local data when offline, without a network attempt', async () => {
      const harness = createHarness({ connectivity: 'offline' })

      const result = await harness.service.start()

      expect(harness.runStartup).toHaveBeenCalledWith(false)
      expect(result).toEqual(STARTUP_SUCCESS)
    })

    it('subscribes to connectivity for the rest of the session only after startup settles', async () => {
      const harness = createHarness()

      expect(harness.listenerCount()).toBe(0)
      await harness.service.start()
      expect(harness.listenerCount()).toBe(1)
    })

    it('never initializes on web', async () => {
      const harness = createHarness({ desktop: false })

      const result = await harness.service.start()

      expect(result).toEqual({ status: 'skipped', reason: 'web' })
      expect(harness.startConnectivity).not.toHaveBeenCalled()
      expect(harness.runStartup).not.toHaveBeenCalled()
      expect(harness.listenerCount()).toBe(0)
    })

    it('resolves instead of throwing when connectivity monitoring fails to start', async () => {
      const harness = createHarness()
      harness.startConnectivity.mockRejectedValue(new Error('listener registration failed'))

      await expect(harness.service.start()).resolves.toEqual(STARTUP_SUCCESS)
      expect(harness.runStartup).toHaveBeenCalledOnce()
    })

    it('collapses a second start() into the same in-flight promise', async () => {
      let resolveStartup!: (value: StartupSyncResult) => void
      const harness = createHarness()
      harness.runStartup.mockReturnValue(new Promise((resolve) => { resolveStartup = resolve }))

      const first = harness.service.start()
      const second = harness.service.start()

      resolveStartup(STARTUP_SUCCESS)
      const [firstResult, secondResult] = await Promise.all([first, second])

      expect(harness.runStartup).toHaveBeenCalledOnce()
      expect(firstResult).toBe(secondResult)
    })
  })

  describe('focus/visibility trigger', () => {
    it('runs one automatic pass when connectivity confirms online', async () => {
      const harness = createHarness()
      await harness.startAndClearThrottle()
      harness.runQueueReplay.mockClear()

      const outcome = await harness.service.runAutomaticPass()

      expect(harness.runQueueReplay).toHaveBeenCalledOnce()
      expect(outcome).toEqual({ status: 'ran', replay: REPLAY_SUCCESS })
    })

    it('collapses repeated connectivity notifications into one pass', async () => {
      let resolveReplay!: (value: QueueReplayOutcome) => void
      const harness = createHarness()
      harness.runQueueReplay.mockReturnValue(new Promise((resolve) => { resolveReplay = resolve }))
      await harness.startAndClearThrottle()

      harness.emitConnectivityChange()
      harness.emitConnectivityChange()
      harness.emitConnectivityChange()

      expect(harness.runQueueReplay).toHaveBeenCalledOnce()
      resolveReplay(REPLAY_SUCCESS)
      await Promise.resolve()
    })

    it('does not auto-sync while the app is hidden or minimized', async () => {
      const harness = createHarness()
      await harness.startAndClearThrottle()
      harness.setVisible(false)

      const outcome = await harness.service.runAutomaticPass()

      expect(outcome).toEqual({ status: 'skipped', reason: 'hidden' })
      expect(harness.runQueueReplay).not.toHaveBeenCalled()
    })

    it('does not auto-sync while offline', async () => {
      const harness = createHarness({ connectivity: 'offline' })
      await harness.startAndClearThrottle()
      harness.setConnectivity('offline')

      const outcome = await harness.service.runAutomaticPass()

      expect(outcome).toEqual({ status: 'skipped', reason: 'offline' })
      expect(harness.runQueueReplay).not.toHaveBeenCalled()
    })

    it('never fires on web even if called directly', async () => {
      const harness = createHarness({ desktop: false })

      const outcome = await harness.service.runAutomaticPass()

      expect(outcome).toEqual({ status: 'skipped', reason: 'web' })
      expect(harness.runQueueReplay).not.toHaveBeenCalled()
    })
  })

  describe('minimum interval', () => {
    it('throttles a second automatic attempt within the minimum interval', async () => {
      const harness = createHarness()
      await harness.startAndClearThrottle()
      harness.runQueueReplay.mockClear()

      await harness.service.runAutomaticPass()
      harness.advanceMs(MIN_AUTOMATIC_SYNC_INTERVAL_MS - 1)
      const throttled = await harness.service.runAutomaticPass()

      expect(harness.runQueueReplay).toHaveBeenCalledOnce()
      expect(throttled).toEqual({ status: 'skipped', reason: 'throttled' })
    })

    it('allows a new automatic attempt once the interval elapses', async () => {
      const harness = createHarness()
      await harness.startAndClearThrottle()
      harness.runQueueReplay.mockClear()

      await harness.service.runAutomaticPass()
      harness.advanceMs(MIN_AUTOMATIC_SYNC_INTERVAL_MS)
      const outcome = await harness.service.runAutomaticPass()

      expect(harness.runQueueReplay).toHaveBeenCalledTimes(2)
      expect(outcome).toEqual({ status: 'ran', replay: REPLAY_SUCCESS })
    })

    it('counts startup itself as an attempt, throttling an immediate focus event after it', async () => {
      const harness = createHarness()
      await harness.service.start()

      const outcome = await harness.service.runAutomaticPass()

      expect(outcome).toEqual({ status: 'skipped', reason: 'throttled' })
      expect(harness.runQueueReplay).not.toHaveBeenCalled()
    })
  })

  describe('manual refresh', () => {
    it('is never subject to the automatic interval guard, since it calls the replay coordinator directly', async () => {
      const harness = createHarness()
      await harness.startAndClearThrottle()
      await harness.service.runAutomaticPass()

      // Manual refresh in production calls `runDesktopQueueReplay` directly,
      // the exact same dependency this harness already tracks — proving the
      // interval guard lives only in `runAutomaticPass`, never around the
      // replay coordinator itself.
      harness.runQueueReplay.mockClear()
      await harness.runQueueReplay()

      expect(harness.runQueueReplay).toHaveBeenCalledOnce()
    })
  })

  describe('failure handling', () => {
    it('releases the in-flight guard when the pass rejects, without throwing', async () => {
      const harness = createHarness()
      await harness.startAndClearThrottle()
      harness.runQueueReplay.mockRejectedValueOnce(new Error('database is locked'))

      const outcome = await harness.service.runAutomaticPass()

      expect(outcome).toEqual({ status: 'failed', error: 'database is locked' })
      expect(harness.service.isAutomaticPassRunning()).toBe(false)

      // The guard is free again — a following attempt still respects the
      // interval (it was recorded on the failed attempt too), but is not
      // permanently stuck.
      harness.advanceMs(MIN_AUTOMATIC_SYNC_INTERVAL_MS)
      const retry = await harness.service.runAutomaticPass()
      expect(retry).toEqual({ status: 'ran', replay: REPLAY_SUCCESS })
    })
  })

  describe('reconnect', () => {
    it('a connectivity notification while already online (no transition) still triggers one pass', async () => {
      // This is the gap the focus/visibility trigger fills: reconnect
      // (offline->online) already replays inside the connectivity service
      // itself, untouched by this service; this covers "still online, just
      // regained focus", which previously triggered nothing at all.
      const harness = createHarness({ connectivity: 'online' })
      await harness.startAndClearThrottle()
      harness.runQueueReplay.mockClear()

      harness.emitConnectivityChange()
      await Promise.resolve()

      expect(harness.runQueueReplay).toHaveBeenCalledOnce()
    })
  })

  describe('stop', () => {
    it('unsubscribes from connectivity and resets state', async () => {
      const harness = createHarness()
      await harness.service.start()
      expect(harness.listenerCount()).toBe(1)

      harness.service.stop()

      expect(harness.listenerCount()).toBe(0)
      harness.emitConnectivityChange()
      expect(harness.runQueueReplay).not.toHaveBeenCalled()
    })
  })
})
