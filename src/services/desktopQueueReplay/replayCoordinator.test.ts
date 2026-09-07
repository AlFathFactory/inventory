import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OfflineCommand } from '../../lib/localDb/models/offlineCommand'
import {
  createDesktopQueueReplayCoordinator,
  type ReplayQueue,
} from './replayCoordinator'

const NOW = '2026-09-08T10:00:00.000Z'
const SYNCED_OUTCOME = {
  status: 'succeeded' as const,
  mode: 'delta' as const,
  nextCursor: 'next',
  rowCounts: {},
  upsertedRows: 1,
  deletedRows: 0,
}

function command(commandId: string, createdAt = NOW): OfflineCommand {
  return {
    commandId,
    commandType: 'inventory_operation',
    contractVersion: 1,
    payload: { item_id: 'item-1', operation_type: 'add', quantity: 2 },
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
    syncedAt: null,
  }
}

function syncedResponse(item: OfflineCommand, idempotency = 'receipt') {
  return {
    ok: true,
    status: 'synced',
    contract_version: item.contractVersion,
    command_id: item.commandId,
    command_type: item.commandType,
    idempotency,
    result: { operation_id: 'operation-1' },
  }
}

function errorResponse(
  item: OfflineCommand,
  status: 'failed' | 'conflict',
  error: {
    code: string
    message: string
    sqlstate: string | null
    retryable: boolean
    requires_user_action: boolean
  },
) {
  return {
    ok: false,
    status,
    contract_version: item.contractVersion,
    command_id: item.commandId,
    command_type: item.commandType,
    error,
  }
}

function queueHarness(initial: OfflineCommand[]) {
  const commands = new Map(initial.map((item) => [item.commandId, structuredClone(item)]))
  const update = (
    commandId: string,
    status: OfflineCommand['status'],
    changes: Partial<OfflineCommand> = {},
  ) => {
    const existing = commands.get(commandId)
    if (!existing) throw new Error(`Missing command ${commandId}`)
    const next = { ...existing, ...changes, status }
    commands.set(commandId, next)
    return Promise.resolve(structuredClone(next))
  }
  const queue: ReplayQueue = {
    async recoverInterruptedCommands() {
      let recovered = 0
      for (const [id, item] of commands) {
        if (item.status !== 'syncing') continue
        commands.set(id, { ...item, status: 'pending' })
        recovered += 1
      }
      return recovered
    },
    async listPendingCommands({ limit, createdAtOrBefore }) {
      return [...commands.values()]
        .filter((item) => item.status === 'pending' && item.createdAt <= createdAtOrBefore)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
          || left.commandId.localeCompare(right.commandId))
        .slice(0, limit)
        .map((item) => structuredClone(item))
    },
    markSyncing: (id) => {
      const existing = commands.get(id)!
      return update(id, 'syncing', { attempts: existing.attempts + 1, lastError: null })
    },
    markSynced: (id) => update(id, 'synced', { syncedAt: NOW, lastError: null }),
    markFailed: (id, error) => update(id, 'failed', { lastError: error }),
    markConflict: (id, error) => update(id, 'conflict', { lastError: error }),
  }
  return { queue, commands }
}

function buildRunner(initial: OfflineCommand[] = [command('command-1')]) {
  const harness = queueHarness(initial)
  const applyCommand = vi.fn(async (item: OfflineCommand) => syncedResponse(item))
  const runDeltaSync = vi.fn(async () => SYNCED_OUTCOME)
  const runExclusive = vi.fn(async <T>(operation: () => Promise<T>) => operation())
  const coordinator = createDesktopQueueReplayCoordinator({
    isDesktop: () => true,
    queue: harness.queue,
    applyCommand,
    runExclusive,
    runDeltaSync,
    now: () => new Date(NOW),
  })
  return { ...harness, applyCommand, runDeltaSync, runExclusive, coordinator }
}

describe('desktop offline command replay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('replays a successful command and runs delta sync', async () => {
    const harness = buildRunner()

    const outcome = await harness.coordinator.run()

    expect(outcome).toMatchObject({ status: 'succeeded', processed: 1, synced: 1 })
    expect(harness.commands.get('command-1')).toMatchObject({ status: 'synced', attempts: 1 })
    expect(harness.runDeltaSync).toHaveBeenCalledOnce()
    expect(harness.runExclusive).toHaveBeenCalledOnce()
  })

  it('marks a backend receipt replay as synced', async () => {
    const harness = buildRunner()
    harness.applyCommand.mockImplementation(async (item) => syncedResponse(item, 'receipt'))

    await harness.coordinator.run()

    expect(harness.commands.get('command-1')?.status).toBe('synced')
  })

  it('maps conflicts and preserves every structured backend error field', async () => {
    const harness = buildRunner()
    harness.applyCommand.mockImplementation(async (item) => errorResponse(item, 'conflict', {
      code: 'insufficient_stock',
      message: 'Insufficient stock.',
      sqlstate: 'P0001',
      retryable: true,
      requires_user_action: true,
    }))

    const outcome = await harness.coordinator.run()

    expect(outcome).toMatchObject({ status: 'succeeded', conflicts: 1 })
    expect(harness.commands.get('command-1')?.status).toBe('conflict')
    expect(JSON.parse(harness.commands.get('command-1')?.lastError ?? '')).toEqual({
      code: 'insufficient_stock',
      message: 'Insufficient stock.',
      sqlstate: 'P0001',
      retryable: true,
      requires_user_action: true,
    })
  })

  it('records a transient retryable failure and stops before the next command', async () => {
    const harness = buildRunner([command('command-1'), command('command-2')])
    harness.applyCommand.mockImplementation(async (item) => errorResponse(item, 'failed', {
      code: 'transient_concurrency',
      message: 'Retry the same command.',
      sqlstate: '40001',
      retryable: true,
      requires_user_action: false,
    }))

    const outcome = await harness.coordinator.run()

    expect(outcome).toMatchObject({
      status: 'stopped',
      stoppedCommandId: 'command-1',
      processed: 1,
      failed: 1,
    })
    expect(harness.commands.get('command-1')?.status).toBe('failed')
    expect(harness.commands.get('command-2')?.status).toBe('pending')
    expect(harness.applyCommand).toHaveBeenCalledOnce()
    expect(harness.runDeltaSync).not.toHaveBeenCalled()
  })

  it('records a non-retryable failure and continues the pass', async () => {
    const harness = buildRunner([command('command-1'), command('command-2')])
    harness.applyCommand
      .mockImplementationOnce(async (item) => errorResponse(item, 'failed', {
        code: 'business_validation_failed',
        message: 'Invalid quantity.',
        sqlstate: '22023',
        retryable: false,
        requires_user_action: true,
      }))
      .mockImplementationOnce(async (item) => syncedResponse(item))

    const outcome = await harness.coordinator.run()

    expect(outcome).toMatchObject({ status: 'succeeded', processed: 2, failed: 1, synced: 1 })
    expect(harness.commands.get('command-1')?.status).toBe('failed')
    expect(harness.commands.get('command-2')?.status).toBe('synced')
    expect(harness.applyCommand).toHaveBeenCalledTimes(2)
  })

  it('passes the immutable envelope without regenerating or mutating it', async () => {
    const original = command('immutable-id')
    const envelope = {
      commandId: original.commandId,
      commandType: original.commandType,
      contractVersion: original.contractVersion,
      payload: structuredClone(original.payload),
    }
    const harness = buildRunner([original])

    await harness.coordinator.run()

    const sent = harness.applyCommand.mock.calls[0][0]
    expect({
      commandId: sent.commandId,
      commandType: sent.commandType,
      contractVersion: sent.contractVersion,
      payload: sent.payload,
    }).toEqual(envelope)
    expect(harness.commands.get('immutable-id')).toMatchObject(envelope)
  })

  it('a new coordinator instance resumes commands that were already pending', async () => {
    const harness = queueHarness([command('persisted-pending')])
    const applyCommand = vi.fn(async (item: OfflineCommand) => syncedResponse(item))
    const dependencies = {
      isDesktop: () => true,
      queue: harness.queue,
      applyCommand,
      runExclusive: async <T>(operation: () => Promise<T>) => operation(),
      runDeltaSync: async () => SYNCED_OUTCOME,
      now: () => new Date(NOW),
    }

    const afterRestart = createDesktopQueueReplayCoordinator(dependencies)
    await afterRestart.run()

    expect(applyCommand).toHaveBeenCalledOnce()
    expect(harness.commands.get('persisted-pending')?.status).toBe('synced')
  })

  it('recovers an interrupted syncing command and accepts its backend receipt', async () => {
    const interrupted = { ...command('interrupted'), status: 'syncing' as const, attempts: 1 }
    const harness = buildRunner([interrupted])
    harness.applyCommand.mockImplementation(async (item) => syncedResponse(item, 'receipt'))

    const outcome = await harness.coordinator.run()

    expect(outcome).toMatchObject({ status: 'succeeded', processed: 1, synced: 1 })
    expect(harness.commands.get('interrupted')).toMatchObject({
      status: 'synced',
      attempts: 2,
    })
  })

  it('collapses concurrent replay calls onto one promise and one RPC call', async () => {
    const harness = buildRunner()
    let release: ((value: unknown) => void) | undefined
    harness.applyCommand.mockImplementation((item) => new Promise((resolve) => {
      release = () => resolve(syncedResponse(item))
    }))

    const first = harness.coordinator.run()
    const second = harness.coordinator.run()
    expect(first).toBe(second)
    await vi.waitFor(() => expect(harness.applyCommand).toHaveBeenCalledOnce())
    release!({})
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(firstResult).toBe(secondResult)
    expect(harness.applyCommand).toHaveBeenCalledOnce()
    expect(harness.runDeltaSync).toHaveBeenCalledOnce()
  })

  it('never reads the queue or calls the RPC on web', async () => {
    const harness = buildRunner()
    const webCoordinator = createDesktopQueueReplayCoordinator({
      isDesktop: () => false,
      queue: harness.queue,
      applyCommand: harness.applyCommand,
      runExclusive: harness.runExclusive,
      runDeltaSync: harness.runDeltaSync,
      now: () => new Date(NOW),
    })

    await expect(webCoordinator.run()).resolves.toEqual({ status: 'skipped', reason: 'web' })
    expect(harness.applyCommand).not.toHaveBeenCalled()
    expect(harness.runExclusive).not.toHaveBeenCalled()
    expect(harness.runDeltaSync).not.toHaveBeenCalled()
  })
})
