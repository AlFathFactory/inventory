import { describe, expect, it, vi } from 'vitest'
import type { OfflineCommand } from '../lib/localDb/models/offlineCommand'
import {
  createDesktopQueuePanelService,
  OfflineCommandRetryNotAllowedError,
  parseQueuePanelError,
} from './desktopQueuePanelService'

function command(overrides: Partial<OfflineCommand> = {}): OfflineCommand {
  return {
    commandId: 'command-1',
    commandType: 'inventory_operation',
    contractVersion: 1,
    payload: { item_id: 'item-1' },
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: '2026-09-08T08:00:00.000Z',
    updatedAt: '2026-09-08T08:00:00.000Z',
    syncedAt: null,
    ...overrides,
  }
}

function counts(overrides: Partial<Record<OfflineCommand['status'], number>> = {}) {
  return { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, ...overrides }
}

function setup(overrides: Record<string, unknown> = {}) {
  const dependencies = {
    isDesktop: vi.fn(() => true),
    getCommand: vi.fn(async () => null),
    getCounts: vi.fn(async () => counts()),
    listRecent: vi.fn(async () => []),
    retry: vi.fn(async (commandId: string) => command({ commandId })),
    replay: vi.fn(async () => undefined),
    ...overrides,
  }
  return { dependencies, service: createDesktopQueuePanelService(dependencies) }
}

describe('desktop queue panel service', () => {
  it('loads bounded recent commands and counts by status without exposing payloads', async () => {
    const retryableError = JSON.stringify({
      code: 'network_error',
      message: 'Try again.',
      retryable: true,
      requires_user_action: false,
    })
    const { dependencies, service } = setup({
      getCounts: vi.fn(async () => counts({ pending: 2, syncing: 1, failed: 1, conflict: 3 })),
      listRecent: vi.fn(async () => [command({
        status: 'failed',
        attempts: 2,
        lastError: retryableError,
      })]),
    })

    const snapshot = await service.load(25)

    expect(dependencies.listRecent).toHaveBeenCalledWith({ limit: 25 })
    expect(snapshot.counts).toEqual({ pending: 2, syncing: 1, failed: 1, conflict: 3 })
    expect(snapshot.commands[0]).toEqual({
      commandId: 'command-1',
      commandType: 'inventory_operation',
      createdAt: '2026-09-08T08:00:00.000Z',
      attempts: 2,
      status: 'failed',
      error: {
        code: 'network_error',
        message: 'Try again.',
        retryable: true,
        requiresUserAction: false,
      },
      canRetry: true,
    })
    expect(snapshot.commands[0]).not.toHaveProperty('payload')
  })

  it('retries only a failed command with an affirmative stored retry policy', async () => {
    const failed = command({
      status: 'failed',
      lastError: JSON.stringify({
        code: 'temporary',
        message: 'Temporary failure.',
        retryable: true,
        requires_user_action: false,
      }),
    })
    const { dependencies, service } = setup({
      getCommand: vi.fn(async () => failed),
    })

    await service.retryFailed(failed.commandId)

    expect(dependencies.retry).toHaveBeenCalledWith(failed.commandId)
    expect(dependencies.replay).toHaveBeenCalledTimes(1)
  })

  it.each([
    command({
      status: 'failed',
      lastError: JSON.stringify({ message: 'Permanent.', retryable: false, requires_user_action: false }),
    }),
    command({
      status: 'conflict',
      lastError: JSON.stringify({ message: 'Review.', retryable: true, requires_user_action: true }),
    }),
  ])('rejects non-retryable and conflict commands without changing queue state', async (stored) => {
    const { dependencies, service } = setup({ getCommand: vi.fn(async () => stored) })

    await expect(service.retryFailed(stored.commandId))
      .rejects.toBeInstanceOf(OfflineCommandRetryNotAllowedError)
    expect(dependencies.retry).not.toHaveBeenCalled()
    expect(dependencies.replay).not.toHaveBeenCalled()
  })

  it('runs pending replay and returns the refreshed queue state', async () => {
    let replayed = false
    const { service } = setup({
      replay: vi.fn(async () => { replayed = true }),
      getCounts: vi.fn(async () => counts(replayed ? { pending: 0 } : { pending: 1 })),
      listRecent: vi.fn(async () => replayed ? [] : [command()]),
    })

    await expect(service.replayPending()).resolves.toEqual({
      counts: { pending: 0, syncing: 0, failed: 0, conflict: 0 },
      commands: [],
    })
  })

  it('collapses concurrent replay actions onto one coordinator call', async () => {
    let finishReplay: (() => void) | undefined
    const replay = vi.fn(() => new Promise<void>((resolve) => { finishReplay = resolve }))
    const { service } = setup({ replay })

    const first = service.replayPending()
    const second = service.replayPending()
    expect(first).toBe(second)
    expect(replay).toHaveBeenCalledTimes(1)
    finishReplay?.()
    await Promise.all([first, second])
  })

  it('does not touch the SQLite queue or replay RPC on web', async () => {
    const { dependencies, service } = setup({ isDesktop: () => false })

    await expect(service.load()).resolves.toEqual({
      counts: { pending: 0, syncing: 0, failed: 0, conflict: 0 },
      commands: [],
    })
    await service.replayPending()

    expect(dependencies.getCounts).not.toHaveBeenCalled()
    expect(dependencies.listRecent).not.toHaveBeenCalled()
    expect(dependencies.replay).not.toHaveBeenCalled()
  })

  it('keeps plain errors visible but disables retry without a stored policy', () => {
    expect(parseQueuePanelError('network unavailable')).toEqual({
      code: null,
      message: 'network unavailable',
      retryable: null,
      requiresUserAction: null,
    })
  })
})
