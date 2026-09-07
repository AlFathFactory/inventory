import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(),
  getSyncState: vi.fn(),
  runInitialFullSync: vi.fn(),
  runDeltaSync: vi.fn(),
}))

vi.mock('../../config/platform', () => ({ isDesktopRuntime: mocks.isDesktopRuntime }))
vi.mock('../../lib/localDb/syncState', () => ({ getSyncState: mocks.getSyncState }))
vi.mock('./fullSync', () => ({ runInitialFullSync: mocks.runInitialFullSync }))
vi.mock('./deltaSync', () => ({ runDeltaSync: mocks.runDeltaSync }))

import {
  hydrateDesktopSyncStatus,
  isDesktopSyncRunning,
  resetDesktopSyncGuard,
  runDesktopDeltaAfterReplay,
  runDesktopSync,
} from './syncCoordinator'
import {
  getDesktopSyncSnapshot,
  resetDesktopSyncSnapshot,
  setDesktopSyncSnapshot,
} from './syncStatusStore'

const SUCCESS = {
  status: 'succeeded' as const,
  nextCursor: '2026-09-07T10:00:00+00:00',
  rowCounts: {},
  upsertedRows: 5,
  deletedRows: 0,
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '3',
    status: 'idle',
    cursor: null,
    lastSuccessfulSyncAt: null,
    lastSyncStartedAt: null,
    lastError: null,
    ...overrides,
  }
}

describe('runDesktopSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDesktopSyncGuard()
    resetDesktopSyncSnapshot()
    mocks.isDesktopRuntime.mockReturnValue(true)
    mocks.getSyncState.mockResolvedValue(state())
    mocks.runInitialFullSync.mockResolvedValue(SUCCESS)
    mocks.runDeltaSync.mockResolvedValue(SUCCESS)
  })

  it('runs a full sync on first launch, when no cursor is stored', async () => {
    const outcome = await runDesktopSync()

    expect(mocks.runInitialFullSync).toHaveBeenCalledOnce()
    expect(mocks.runDeltaSync).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ status: 'succeeded', mode: 'full', upsertedRows: 5 })
  })

  it('runs a delta sync on a later launch, when a cursor exists', async () => {
    mocks.getSyncState.mockResolvedValue(state({ cursor: '2026-09-01T00:00:00+00:00' }))

    const outcome = await runDesktopSync()

    expect(mocks.runDeltaSync).toHaveBeenCalledOnce()
    expect(mocks.runInitialFullSync).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({ status: 'succeeded', mode: 'delta' })
  })

  it('falls back to a full sync when the delta reports the cursor is gone', async () => {
    mocks.getSyncState.mockResolvedValue(state({ cursor: 'c1' }))
    mocks.runDeltaSync.mockResolvedValue({ status: 'requires_full_sync' })

    const outcome = await runDesktopSync()

    expect(mocks.runInitialFullSync).toHaveBeenCalledOnce()
    expect(outcome).toMatchObject({ status: 'succeeded', mode: 'full' })
  })

  it('prefers delta after replay and falls back to full without a cursor', async () => {
    mocks.runDeltaSync.mockResolvedValueOnce({ status: 'requires_full_sync' })

    const outcome = await runDesktopDeltaAfterReplay()

    expect(mocks.runDeltaSync).toHaveBeenCalledOnce()
    expect(mocks.runInitialFullSync).toHaveBeenCalledOnce()
    expect(outcome).toMatchObject({ status: 'succeeded', mode: 'full' })
  })

  it('never runs on web', async () => {
    mocks.isDesktopRuntime.mockReturnValue(false)

    expect(await runDesktopSync()).toEqual({ status: 'skipped' })
    expect(mocks.getSyncState).not.toHaveBeenCalled()
    expect(mocks.runInitialFullSync).not.toHaveBeenCalled()
    expect(mocks.runDeltaSync).not.toHaveBeenCalled()
  })

  describe('concurrency guard', () => {
    it('collapses concurrent calls onto a single run', async () => {
      let release: (value: typeof SUCCESS) => void = () => {}
      mocks.runInitialFullSync.mockReturnValue(new Promise((resolve) => { release = resolve }))

      const first = runDesktopSync()
      const second = runDesktopSync()
      const third = runDesktopSync()

      expect(isDesktopSyncRunning()).toBe(true)
      release(SUCCESS)
      const results = await Promise.all([first, second, third])

      expect(mocks.runInitialFullSync).toHaveBeenCalledOnce()
      expect(results[0]).toBe(results[1])
      expect(results[1]).toBe(results[2])
    })

    it('allows a new run once the previous one settles', async () => {
      await runDesktopSync()
      expect(isDesktopSyncRunning()).toBe(false)

      await runDesktopSync()

      expect(mocks.runInitialFullSync).toHaveBeenCalledTimes(2)
    })

    it('releases the guard even when the run fails', async () => {
      mocks.runInitialFullSync.mockRejectedValueOnce(new Error('boom'))

      expect(await runDesktopSync()).toMatchObject({ status: 'failed', error: 'boom' })
      expect(isDesktopSyncRunning()).toBe(false)

      mocks.runInitialFullSync.mockResolvedValue(SUCCESS)
      expect(await runDesktopSync()).toMatchObject({ status: 'succeeded' })
    })
  })

  describe('status surface', () => {
    it('reports syncing while in flight, then synced', async () => {
      let release: (value: typeof SUCCESS) => void = () => {}
      mocks.runInitialFullSync.mockReturnValue(new Promise((resolve) => { release = resolve }))

      const run = runDesktopSync()
      expect(getDesktopSyncSnapshot().phase).toBe('syncing')

      await vi.waitFor(() => expect(mocks.runInitialFullSync).toHaveBeenCalledOnce())
      release(SUCCESS)
      await run

      expect(getDesktopSyncSnapshot().phase).toBe('synced')
      expect(getDesktopSyncSnapshot().lastSuccessfulSyncAt).not.toBeNull()
    })

    it('reports a failure without discarding the previous success time', async () => {
      setDesktopSyncSnapshot({ lastSuccessfulSyncAt: '2026-09-01T00:00:00Z' })
      mocks.runDeltaSync.mockResolvedValue({ status: 'failed', error: 'network down' })
      mocks.getSyncState.mockResolvedValue(state({ cursor: 'c1' }))

      const outcome = await runDesktopSync()

      expect(outcome).toEqual({ status: 'failed', mode: 'delta', error: 'network down' })
      expect(getDesktopSyncSnapshot()).toMatchObject({
        phase: 'failed',
        lastError: 'network down',
        lastSuccessfulSyncAt: '2026-09-01T00:00:00Z',
      })
    })

    it('reports a failure when the local state cannot even be read', async () => {
      mocks.getSyncState.mockRejectedValue(new Error('database is locked'))

      expect(await runDesktopSync())
        .toEqual({ status: 'failed', mode: null, error: 'database is locked' })
      expect(mocks.runInitialFullSync).not.toHaveBeenCalled()
    })
  })

  describe('hydrateDesktopSyncStatus', () => {
    it('publishes the persisted state without running a sync', async () => {
      mocks.getSyncState.mockResolvedValue(state({
        status: 'succeeded',
        cursor: 'c1',
        lastSuccessfulSyncAt: '2026-09-05T08:00:00Z',
      }))

      await hydrateDesktopSyncStatus()

      expect(getDesktopSyncSnapshot()).toMatchObject({
        phase: 'synced',
        lastSuccessfulSyncAt: '2026-09-05T08:00:00Z',
        hydrated: true,
      })
      expect(mocks.runInitialFullSync).not.toHaveBeenCalled()
      expect(mocks.runDeltaSync).not.toHaveBeenCalled()
    })

    it('does nothing on web', async () => {
      mocks.isDesktopRuntime.mockReturnValue(false)

      await hydrateDesktopSyncStatus()

      expect(getDesktopSyncSnapshot().hydrated).toBe(false)
      expect(mocks.getSyncState).not.toHaveBeenCalled()
    })
  })
})
