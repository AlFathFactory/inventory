import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONNECTIVITY_RECHECK_DEBOUNCE_MS,
  CONNECTIVITY_VISIBLE_INTERVAL_MS,
  createDesktopConnectivityService,
  type DesktopConnectivityDependencies,
} from './desktopConnectivityService'
import type { DesktopConnectivityState } from './desktopConnectivityStore'

interface PublishedState {
  state: DesktopConnectivityState
  lastCheckedAt?: string
  initialized?: boolean
}

function createHarness(options: {
  desktop?: boolean
  browserOnline?: boolean
  backendReachable?: boolean
} = {}) {
  let browserOnline = options.browserOnline ?? true
  let backendReachable = options.backendReachable ?? true
  const onlineListeners = new Set<() => void>()
  const offlineListeners = new Set<() => void>()
  const visibilityListeners = new Set<() => void>()
  const published: PublishedState[] = []
  const probeBackend = vi.fn(async () => backendReachable)
  const replayPending = vi.fn(async () => ({ status: 'completed' }))
  const repeat = vi.fn((listener: () => void, intervalMs: number) => {
    const timer = setInterval(listener, intervalMs)
    return () => clearInterval(timer)
  })

  const dependencies: DesktopConnectivityDependencies = {
    isDesktop: () => options.desktop ?? true,
    isBrowserOnline: () => browserOnline,
    isDocumentVisible: () => true,
    probeBackend,
    replayPending,
    publish: (snapshot) => published.push(snapshot),
    now: () => new Date('2026-09-08T10:00:00.000Z'),
    listenOnline: (listener) => {
      onlineListeners.add(listener)
      return () => onlineListeners.delete(listener)
    },
    listenOffline: (listener) => {
      offlineListeners.add(listener)
      return () => offlineListeners.delete(listener)
    },
    listenVisibility: (listener) => {
      visibilityListeners.add(listener)
      return () => visibilityListeners.delete(listener)
    },
    schedule: (listener, delayMs) => {
      const timer = setTimeout(listener, delayMs)
      return () => clearTimeout(timer)
    },
    repeat,
  }

  return {
    service: createDesktopConnectivityService(dependencies),
    published,
    probeBackend,
    replayPending,
    repeat,
    setBrowserOnline(value: boolean) {
      browserOnline = value
    },
    setBackendReachable(value: boolean) {
      backendReachable = value
    },
    emitOnline() {
      for (const listener of onlineListeners) listener()
    },
    emitOffline() {
      for (const listener of offlineListeners) listener()
    },
    listenerCount() {
      return onlineListeners.size + offlineListeners.size + visibilityListeners.size
    },
    lastState() {
      return published.at(-1)
    },
  }
}

describe('desktop connectivity service', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('starts offline without replaying or blocking local reads', async () => {
    const harness = createHarness({ browserOnline: false, backendReachable: false })

    await harness.service.start()
    const localRead = await Promise.resolve(['local-row'])

    expect(localRead).toEqual(['local-row'])
    expect(harness.lastState()).toMatchObject({ state: 'offline', initialized: true })
    expect(harness.probeBackend).toHaveBeenCalledOnce()
    expect(harness.replayPending).not.toHaveBeenCalled()
    harness.service.stop()
  })

  it('starts online only after a successful backend reachability check', async () => {
    const harness = createHarness({ browserOnline: true, backendReachable: true })

    await harness.service.start()

    expect(harness.published.map(({ state }) => state)).toEqual(['checking', 'online'])
    expect(harness.probeBackend).toHaveBeenCalledWith(true)
    expect(harness.replayPending).not.toHaveBeenCalled()
    expect(harness.repeat).toHaveBeenCalledWith(expect.any(Function), CONNECTIVITY_VISIBLE_INTERVAL_MS)
    harness.service.stop()
  })

  it('treats navigator online with an unreachable backend as offline', async () => {
    const harness = createHarness({ browserOnline: true, backendReachable: false })

    await harness.service.start()

    expect(harness.lastState()).toMatchObject({ state: 'offline', initialized: true })
    expect(harness.replayPending).not.toHaveBeenCalled()
    harness.service.stop()
  })

  it('keeps an online browser event offline when the backend is unreachable', async () => {
    const harness = createHarness({ browserOnline: false, backendReachable: false })
    await harness.service.start()

    harness.setBrowserOnline(true)
    harness.emitOnline()
    await vi.advanceTimersByTimeAsync(CONNECTIVITY_RECHECK_DEBOUNCE_MS)

    expect(harness.probeBackend).toHaveBeenCalledTimes(2)
    expect(harness.lastState()).toMatchObject({ state: 'offline' })
    expect(harness.replayPending).not.toHaveBeenCalled()
    harness.service.stop()
  })

  it('triggers exactly one replay after a confirmed offline-to-online transition', async () => {
    const harness = createHarness({ browserOnline: false, backendReachable: false })
    await harness.service.start()

    harness.setBrowserOnline(true)
    harness.setBackendReachable(true)
    harness.emitOnline()
    await vi.advanceTimersByTimeAsync(CONNECTIVITY_RECHECK_DEBOUNCE_MS)

    expect(harness.lastState()).toMatchObject({ state: 'online' })
    expect(harness.replayPending).toHaveBeenCalledTimes(1)
    harness.service.stop()
  })

  it('debounces repeated reconnect hints into one check and one replay', async () => {
    const harness = createHarness({ browserOnline: false, backendReachable: false })
    await harness.service.start()

    harness.setBrowserOnline(true)
    harness.setBackendReachable(true)
    harness.emitOnline()
    harness.emitOnline()
    harness.emitOnline()
    await vi.advanceTimersByTimeAsync(CONNECTIVITY_RECHECK_DEBOUNCE_MS)

    expect(harness.probeBackend).toHaveBeenCalledTimes(2)
    expect(harness.replayPending).toHaveBeenCalledTimes(1)
    harness.service.stop()
  })

  it('collapses a second confirmed reconnect while replay is already running', async () => {
    let finishReplay!: () => void
    const replayBlocked = new Promise<void>((resolve) => { finishReplay = resolve })
    const harness = createHarness({ browserOnline: false, backendReachable: false })
    harness.replayPending.mockImplementation(() => replayBlocked)
    await harness.service.start()

    harness.setBrowserOnline(true)
    harness.setBackendReachable(true)
    harness.emitOnline()
    await vi.advanceTimersByTimeAsync(CONNECTIVITY_RECHECK_DEBOUNCE_MS)
    expect(harness.replayPending).toHaveBeenCalledOnce()

    harness.setBrowserOnline(false)
    harness.setBackendReachable(false)
    harness.emitOffline()
    await vi.advanceTimersByTimeAsync(CONNECTIVITY_RECHECK_DEBOUNCE_MS)
    expect(harness.lastState()).toMatchObject({ state: 'offline' })

    harness.setBrowserOnline(true)
    harness.setBackendReachable(true)
    harness.emitOnline()
    await vi.advanceTimersByTimeAsync(CONNECTIVITY_RECHECK_DEBOUNCE_MS)

    expect(harness.probeBackend).toHaveBeenCalledTimes(4)
    expect(harness.replayPending).toHaveBeenCalledOnce()
    finishReplay()
    await replayBlocked
    harness.service.stop()
  })

  it('does not initialize listeners, probes, or replay on web', async () => {
    const harness = createHarness({ desktop: false })

    await harness.service.start()

    expect(harness.listenerCount()).toBe(0)
    expect(harness.repeat).not.toHaveBeenCalled()
    expect(harness.probeBackend).not.toHaveBeenCalled()
    expect(harness.replayPending).not.toHaveBeenCalled()
  })

  it('confirms an offline browser hint against the backend without touching pending commands', async () => {
    const harness = createHarness({ browserOnline: true, backendReachable: true })
    await harness.service.start()

    harness.setBrowserOnline(false)
    harness.setBackendReachable(false)
    harness.emitOffline()
    await vi.advanceTimersByTimeAsync(CONNECTIVITY_RECHECK_DEBOUNCE_MS)

    expect(harness.lastState()).toMatchObject({ state: 'offline' })
    expect(harness.replayPending).not.toHaveBeenCalled()
    harness.service.stop()
  })
})
