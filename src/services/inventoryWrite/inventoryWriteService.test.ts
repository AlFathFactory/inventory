import { describe, expect, it, vi } from 'vitest'
import type {
  EnqueueCommandInput,
  OfflineCommand,
} from '../../lib/localDb/models/offlineCommand'
import type { ApplyInventoryOperationParams } from '../operationsService'
import {
  createInventoryWriteService,
  type InventoryWriteDependencies,
} from './inventoryWriteService'

const addInput: ApplyInventoryOperationParams = {
  requestId: 'add-command',
  tableName: 'consumables',
  categoryName: 'Consumables',
  itemId: 'item-1',
  itemName: 'Gloves',
  operationType: 'add',
  quantity: 5,
  operationDate: '2026-09-07',
  supplierId: 'supplier-1',
}

function queuedCommand(input: EnqueueCommandInput, status: OfflineCommand['status'] = 'pending'): OfflineCommand {
  return {
    commandId: input.commandId ?? 'generated-command',
    commandType: input.commandType,
    contractVersion: input.contractVersion,
    payload: input.payload,
    status,
    attempts: status === 'pending' ? 0 : 1,
    lastError: null,
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T10:00:00.000Z',
    syncedAt: status === 'synced' ? '2026-09-07T10:00:01.000Z' : null,
  }
}

function setup(overrides: Partial<InventoryWriteDependencies> = {}) {
  let stored: OfflineCommand | null = null
  const dependencies: InventoryWriteDependencies = {
    isDesktop: vi.fn(() => true),
    createCommandId: vi.fn(() => 'generated-command'),
    writeDirect: vi.fn(async () => ({ status: 'success' })),
    enqueue: vi.fn(async (input) => {
      stored = queuedCommand(input)
      return stored
    }),
    getQueuedCommand: vi.fn(async () => stored),
    isOnline: vi.fn(async () => false),
    replay: vi.fn(async () => undefined),
    ...overrides,
  }
  return { dependencies, service: createInventoryWriteService(dependencies), getStored: () => stored }
}

describe('inventory write routing', () => {
  it('leaves the existing web write path direct and never touches replay', async () => {
    const { dependencies, service } = setup({
      isDesktop: () => false,
    })

    const result = await service.write(addInput)

    expect(dependencies.writeDirect).toHaveBeenCalledWith(addInput)
    expect(dependencies.enqueue).not.toHaveBeenCalled()
    expect(dependencies.replay).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'synced', commandId: 'add-command', runtime: 'web' })
  })

  it('preserves the existing web-offline direct executor behavior', async () => {
    const { dependencies, service } = setup({
      isDesktop: () => false,
      writeDirect: vi.fn(async () => ({ ok: true, offline: true })),
    })

    const result = await service.write(addInput)

    expect(result).toEqual({ status: 'queued', commandId: 'add-command', runtime: 'web' })
    expect(dependencies.enqueue).not.toHaveBeenCalled()
    expect(dependencies.replay).not.toHaveBeenCalled()
  })

  it('queues a desktop add before checking connectivity and leaves it pending offline', async () => {
    const order: string[] = []
    const { dependencies, service } = setup({
      enqueue: vi.fn(async (input) => {
        order.push('enqueue')
        return queuedCommand(input)
      }),
      isOnline: vi.fn(async () => {
        order.push('online')
        return false
      }),
    })

    const result = await service.write(addInput)

    expect(order).toEqual(['enqueue', 'online'])
    expect(dependencies.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      commandId: 'add-command',
      commandType: 'inventory_operation',
      contractVersion: 1,
      payload: expect.objectContaining({
        operation_type: 'add',
        supplier_id: 'supplier-1',
      }),
    }))
    expect(dependencies.replay).not.toHaveBeenCalled()
    expect(dependencies.writeDirect).not.toHaveBeenCalled()
    expect(result.status).toBe('queued')
  })

  it('queues group issue fields without changing their order or command id', async () => {
    const { dependencies, service } = setup()
    const employeeIds = ['employee-2', 'employee-1']

    const result = await service.write({
      ...addInput,
      requestId: 'issue-command',
      operationType: 'issue',
      supplierId: null,
      employeeId: null,
      employeeIds,
    })

    expect(dependencies.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      commandId: 'issue-command',
      payload: expect.objectContaining({
        operation_type: 'issue',
        employee_id: null,
        employee_ids: employeeIds,
        supplier_id: null,
      }),
    }))
    expect(result.commandId).toBe('issue-command')
  })

  it('queues an adjustment with its absolute balance payload', async () => {
    const { dependencies, service } = setup()

    await service.write({
      ...addInput,
      requestId: 'adjust-command',
      operationType: 'adjust',
      quantity: 17,
      supplierId: null,
    })

    expect(dependencies.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      commandId: 'adjust-command',
      payload: expect.objectContaining({ operation_type: 'adjust', quantity: 17 }),
    }))
  })

  it('triggers replay online and reports the authoritative synced queue state', async () => {
    let stored: OfflineCommand | null = null
    const { dependencies, service } = setup({
      enqueue: vi.fn(async (input) => {
        stored = queuedCommand(input)
        return stored
      }),
      isOnline: vi.fn(async () => true),
      replay: vi.fn(async () => {
        if (stored) stored = { ...stored, status: 'synced', attempts: 1 }
      }),
      getQueuedCommand: vi.fn(async () => stored),
    })

    const result = await service.write(addInput)

    expect(dependencies.replay).toHaveBeenCalledTimes(1)
    expect(dependencies.getQueuedCommand).toHaveBeenCalledWith('add-command')
    expect(dependencies.writeDirect).not.toHaveBeenCalled()
    expect(result.status).toBe('synced')
  })

  it('maps a backend conflict and its structured fields to the typed result', async () => {
    let stored: OfflineCommand | null = null
    const { service } = setup({
      enqueue: vi.fn(async (input) => {
        stored = queuedCommand(input)
        return stored
      }),
      isOnline: vi.fn(async () => true),
      replay: vi.fn(async () => {
        if (stored) {
          stored = {
            ...stored,
            status: 'conflict',
            attempts: 1,
            lastError: JSON.stringify({
              code: 'stock_conflict',
              message: 'Stock changed on the server.',
              sqlstate: 'P0001',
              retryable: false,
              requires_user_action: true,
            }),
          }
        }
      }),
      getQueuedCommand: vi.fn(async () => stored),
    })

    const result = await service.write(addInput)

    expect(result).toMatchObject({
      status: 'conflict',
      commandId: 'add-command',
      error: {
        code: 'stock_conflict',
        message: 'Stock changed on the server.',
        sqlstate: 'P0001',
        retryable: false,
        requiresUserAction: true,
      },
    })
  })

  it('collapses identical concurrent desktop submits onto one durable enqueue', async () => {
    let finishEnqueue: ((command: OfflineCommand) => void) | undefined
    const enqueue = vi.fn((input: EnqueueCommandInput) => new Promise<OfflineCommand>((resolve) => {
      finishEnqueue = resolve
      void input
    }))
    const { service } = setup({ enqueue })

    const first = service.write(addInput)
    const second = service.write(addInput)
    expect(enqueue).toHaveBeenCalledTimes(1)
    finishEnqueue?.(queuedCommand({
      commandId: 'add-command',
      commandType: 'inventory_operation',
      contractVersion: 1,
      payload: {},
    }))

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 'queued', commandId: 'add-command' }),
      expect.objectContaining({ status: 'queued', commandId: 'add-command' }),
    ])
  })
})
