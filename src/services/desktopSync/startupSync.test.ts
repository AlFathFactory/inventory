import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(),
  initializeLocalDb: vi.fn(),
  runDesktopSync: vi.fn(),
  runDesktopQueueReplay: vi.fn(),
  hydrateDesktopSyncStatus: vi.fn(),
  recoverInterruptedCommands: vi.fn(),
}))

vi.mock('../../config/platform', () => ({ isDesktopRuntime: mocks.isDesktopRuntime }))
vi.mock('../../lib/localDb', () => ({ initializeLocalDb: mocks.initializeLocalDb }))
vi.mock('../../repositories/local/offlineCommandQueueRepository', () => ({
  localOfflineCommandQueueRepository: {
    recoverInterruptedCommands: mocks.recoverInterruptedCommands,
  },
}))
vi.mock('./syncCoordinator', () => ({
  runDesktopSync: mocks.runDesktopSync,
  hydrateDesktopSyncStatus: mocks.hydrateDesktopSyncStatus,
}))
vi.mock('../desktopQueueReplay', () => ({
  runDesktopQueueReplay: mocks.runDesktopQueueReplay,
}))

import { runStartupSync } from './startupSync'
import { getDesktopSyncSnapshot, resetDesktopSyncSnapshot } from './syncStatusStore'

describe('runStartupSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDesktopSyncSnapshot()
    mocks.isDesktopRuntime.mockReturnValue(true)
    mocks.initializeLocalDb.mockResolvedValue(undefined)
    mocks.hydrateDesktopSyncStatus.mockResolvedValue(undefined)
    mocks.recoverInterruptedCommands.mockResolvedValue(0)
    mocks.runDesktopSync.mockResolvedValue({ status: 'succeeded', mode: 'full' })
    mocks.runDesktopQueueReplay.mockResolvedValue({
      status: 'succeeded',
      syncOutcome: { status: 'succeeded', mode: 'delta' },
      processed: 0,
      synced: 0,
      failed: 0,
      conflicts: 0,
      reachedPassLimit: false,
    })
  })

  it('initializes the database, publishes state, recovers, then syncs — in that order', async () => {
    const calls: string[] = []
    mocks.initializeLocalDb.mockImplementation(async () => { calls.push('init') })
    mocks.hydrateDesktopSyncStatus.mockImplementation(async () => { calls.push('hydrate') })
    mocks.recoverInterruptedCommands.mockImplementation(async () => {
      calls.push('recover')
      return 0
    })
    mocks.runDesktopQueueReplay.mockImplementation(async () => {
      calls.push('replay')
      return {
        status: 'succeeded',
        syncOutcome: { status: 'succeeded', mode: 'delta' },
        processed: 0,
        synced: 0,
        failed: 0,
        conflicts: 0,
        reachedPassLimit: false,
      }
    })

    const result = await runStartupSync()

    expect(calls).toEqual(['init', 'hydrate', 'recover', 'replay'])
    expect(result).toMatchObject({ status: 'succeeded', mode: 'delta' })
  })

  it('resolves instead of throwing when the sync fails, so the app still opens', async () => {
    mocks.runDesktopQueueReplay.mockResolvedValue({
      status: 'succeeded',
      syncOutcome: { status: 'failed', mode: 'delta', error: 'offline' },
      processed: 0,
      synced: 0,
      failed: 0,
      conflicts: 0,
      reachedPassLimit: false,
    })

    await expect(runStartupSync()).resolves.toEqual({
      status: 'failed',
      mode: 'delta',
      error: 'offline',
    })
  })

  it('resolves when the local database cannot be opened, and does not sync', async () => {
    mocks.initializeLocalDb.mockRejectedValue(new Error('disk is full'))

    const result = await runStartupSync()

    expect(result).toEqual({ status: 'skipped', reason: 'unavailable', error: 'disk is full' })
    expect(mocks.recoverInterruptedCommands).not.toHaveBeenCalled()
    expect(mocks.runDesktopQueueReplay).not.toHaveBeenCalled()
    expect(mocks.runDesktopSync).not.toHaveBeenCalled()
    expect(getDesktopSyncSnapshot()).toMatchObject({ phase: 'failed', lastError: 'disk is full' })
  })

  it('recovers interrupted commands unconditionally, then opens with local data when offline', async () => {
    const result = await runStartupSync({ allowNetwork: false })

    expect(result).toEqual({ status: 'skipped', reason: 'offline' })
    expect(mocks.initializeLocalDb).toHaveBeenCalledOnce()
    expect(mocks.hydrateDesktopSyncStatus).toHaveBeenCalledOnce()
    // Recovery must not depend on a replay pass actually running — a command
    // stuck `syncing` from a crash must not stay stuck forever on a launch
    // that stays offline the whole session.
    expect(mocks.recoverInterruptedCommands).toHaveBeenCalledOnce()
    expect(mocks.runDesktopQueueReplay).not.toHaveBeenCalled()
    expect(mocks.runDesktopSync).not.toHaveBeenCalled()
  })

  it('recovers interrupted commands before replaying when online', async () => {
    await runStartupSync({ allowNetwork: true })

    expect(mocks.recoverInterruptedCommands).toHaveBeenCalledOnce()
    expect(mocks.runDesktopQueueReplay).toHaveBeenCalledOnce()
  })

  it('resolves instead of throwing if recovery fails, and does not replay', async () => {
    mocks.recoverInterruptedCommands.mockRejectedValue(new Error('queue table locked'))

    const result = await runStartupSync()

    expect(result).toEqual({ status: 'skipped', reason: 'unavailable', error: 'queue table locked' })
    expect(mocks.runDesktopQueueReplay).not.toHaveBeenCalled()
  })

  it('never throws even if hydration fails', async () => {
    mocks.hydrateDesktopSyncStatus.mockRejectedValue(new Error('metadata unreadable'))

    await expect(runStartupSync()).resolves.toMatchObject({ status: 'skipped' })
    expect(mocks.recoverInterruptedCommands).not.toHaveBeenCalled()
  })

  it('resolves instead of throwing if replay cannot start', async () => {
    mocks.runDesktopQueueReplay.mockRejectedValue(new Error('queue unavailable'))

    await expect(runStartupSync()).resolves.toEqual({
      status: 'failed',
      mode: null,
      error: 'queue unavailable',
    })
  })

  it('does nothing on web', async () => {
    mocks.isDesktopRuntime.mockReturnValue(false)

    expect(await runStartupSync()).toEqual({ status: 'skipped', reason: 'web' })
    expect(mocks.initializeLocalDb).not.toHaveBeenCalled()
    expect(mocks.recoverInterruptedCommands).not.toHaveBeenCalled()
    expect(mocks.runDesktopQueueReplay).not.toHaveBeenCalled()
    expect(mocks.runDesktopSync).not.toHaveBeenCalled()
  })
})
