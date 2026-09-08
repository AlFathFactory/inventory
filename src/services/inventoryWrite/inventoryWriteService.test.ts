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
    writeInventoryDirect: vi.fn(async () => ({ status: 'success' })),
    writeReturnDirect: vi.fn(async () => ({ status: 'success' })),
    writeDeleteDirect: vi.fn(async () => ({ status: 'deleted' })),
    writeRawMaterialDirect: vi.fn(async () => ({ status: 'success' })),
    writeCustodyAddDirect: vi.fn(async () => ({ status: 'success' })),
    writeCustodyScrapDirect: vi.fn(async () => ({ status: 'success' })),
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

    expect(dependencies.writeInventoryDirect).toHaveBeenCalledWith(addInput)
    expect(dependencies.enqueue).not.toHaveBeenCalled()
    expect(dependencies.replay).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'synced', commandId: 'add-command', runtime: 'web' })
  })

  it('preserves the existing web-offline direct executor behavior', async () => {
    const { dependencies, service } = setup({
      isDesktop: () => false,
      writeInventoryDirect: vi.fn(async () => ({ ok: true, offline: true })),
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
    expect(dependencies.writeInventoryDirect).not.toHaveBeenCalled()
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
    expect(dependencies.writeInventoryDirect).not.toHaveBeenCalled()
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

  it('keeps web return and delete on their existing direct executors', async () => {
    const { dependencies, service } = setup({ isDesktop: () => false })

    const returnResult = await service.writeReturn({
      issueOperationId: 'issue-1',
      quantity: 2,
      operationDate: '2026-09-08',
      requestId: 'web-return',
    })
    const deleteResult = await service.writeDelete({
      operationId: 'operation-1',
      deletedBy: 'web-user',
      requestId: 'web-delete',
    })

    expect(dependencies.writeReturnDirect).toHaveBeenCalledWith({
      issueOperationId: 'issue-1',
      quantity: 2,
      operationDate: '2026-09-08',
      requestId: 'web-return',
    })
    expect(dependencies.writeDeleteDirect).toHaveBeenCalledWith('operation-1', 'web-user')
    expect(dependencies.enqueue).not.toHaveBeenCalled()
    expect(dependencies.replay).not.toHaveBeenCalled()
    expect(returnResult.status).toBe('synced')
    expect(deleteResult.status).toBe('synced')
  })

  it('queues return and delete commands without direct desktop RPC calls', async () => {
    const { dependencies, service } = setup()

    await service.writeReturn({
      issueOperationId: 'issue-1',
      employeeId: 'employee-1',
      quantity: 2,
      operationDate: '2026-09-08',
      notes: 'return note',
      receivedBy: 'receiver',
      requestId: 'desktop-return',
    })
    await service.writeDelete({
      operationId: 'operation-1',
      deletedBy: 'desktop-user',
      requestId: 'desktop-delete',
    })

    expect(dependencies.enqueue).toHaveBeenNthCalledWith(1, {
      commandId: 'desktop-return',
      commandType: 'return',
      contractVersion: 1,
      payload: {
        issue_operation_id: 'issue-1',
        employee_id: 'employee-1',
        quantity: 2,
        operation_date: '2026-09-08',
        notes: 'return note',
        received_by: 'receiver',
      },
    })
    expect(dependencies.enqueue).toHaveBeenNthCalledWith(2, {
      commandId: 'desktop-delete',
      commandType: 'delete_operation',
      contractVersion: 1,
      payload: { operation_id: 'operation-1' },
    })
    expect(dependencies.writeReturnDirect).not.toHaveBeenCalled()
    expect(dependencies.writeDeleteDirect).not.toHaveBeenCalled()
  })

  it('replays return online and maps its persisted conflict', async () => {
    let stored: OfflineCommand | null = null
    const { dependencies, service } = setup({
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
              code: 'return_conflict',
              message: 'The remaining returnable quantity changed.',
              sqlstate: 'P0001',
              retryable: false,
              requires_user_action: true,
            }),
          }
        }
      }),
      getQueuedCommand: vi.fn(async () => stored),
    })

    const result = await service.writeReturn({
      issueOperationId: 'issue-1',
      quantity: 2,
      operationDate: '2026-09-08',
      requestId: 'return-conflict',
    })

    expect(dependencies.replay).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      status: 'conflict',
      commandId: 'return-conflict',
      error: {
        code: 'return_conflict',
        retryable: false,
        requiresUserAction: true,
      },
    })
  })

  it('keeps duplicate return command ids idempotent while in flight', async () => {
    let finishEnqueue: ((command: OfflineCommand) => void) | undefined
    const enqueue = vi.fn((input: EnqueueCommandInput) => new Promise<OfflineCommand>((resolve) => {
      finishEnqueue = resolve
      void input
    }))
    const { service } = setup({ enqueue })
    const input = {
      issueOperationId: 'issue-1',
      quantity: 1,
      operationDate: '2026-09-08',
      requestId: 'same-return-command',
    }

    const first = service.writeReturn(input)
    const second = service.writeReturn(input)
    expect(enqueue).toHaveBeenCalledTimes(1)
    finishEnqueue?.(queuedCommand({
      commandId: 'same-return-command',
      commandType: 'return',
      contractVersion: 1,
      payload: {},
    }))

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
  })

  it('keeps the web raw-material path on its existing direct executor', async () => {
    const { dependencies, service } = setup({ isDesktop: () => false })
    const input = {
      itemId: 'material-1',
      operationType: 'add' as const,
      quantity: 3,
      projectId: 'project-1',
      operationDate: '2026-09-08',
      supplierId: 'supplier-1',
      requestId: 'web-raw-add',
    }

    const result = await service.writeRawMaterial(input)

    expect(dependencies.writeRawMaterialDirect).toHaveBeenCalledWith(input)
    expect(dependencies.enqueue).not.toHaveBeenCalled()
    expect(dependencies.replay).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'synced', commandId: 'web-raw-add', runtime: 'web' })
  })

  it('queues raw-material add offline and never invokes its direct RPC executor', async () => {
    const { dependencies, service } = setup()

    const result = await service.writeRawMaterial({
      itemId: 'material-1',
      operationType: 'add',
      quantity: 3,
      projectId: 'project-1',
      operationDate: '2026-09-08',
      supplierId: 'supplier-1',
      receivedBy: 'receiver',
      purchaseOrderNumber: 'PO-1',
      requestId: 'desktop-raw-add',
    })

    expect(dependencies.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      commandId: 'desktop-raw-add',
      commandType: 'raw_material_operation',
      contractVersion: 1,
      payload: expect.objectContaining({
        item_id: 'material-1',
        operation_type: 'add',
        project_id: 'project-1',
        supplier_id: 'supplier-1',
        employee_ids: [],
      }),
    }))
    expect(dependencies.writeRawMaterialDirect).not.toHaveBeenCalled()
    expect(dependencies.replay).not.toHaveBeenCalled()
    expect(result.status).toBe('queued')
  })

  it('preserves raw-material group issue fields and replays online', async () => {
    let stored: OfflineCommand | null = null
    const employeeIds = ['employee-2', 'employee-1']
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

    const result = await service.writeRawMaterial({
      itemId: 'material-1',
      operationType: 'issue',
      quantity: 2,
      projectId: 'project-1',
      operationDate: '2026-09-08',
      employeeId: null,
      employeeIds,
      requestId: 'desktop-raw-issue',
    })

    expect(dependencies.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      commandType: 'raw_material_operation',
      payload: expect.objectContaining({
        operation_type: 'issue',
        employee_id: null,
        employee_ids: employeeIds,
        supplier_id: null,
      }),
    }))
    expect(dependencies.replay).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('synced')
  })

  it('maps a persisted raw-material replay conflict', async () => {
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
              code: 'insufficient_stock',
              message: 'Insufficient stock.',
              sqlstate: 'P0001',
              retryable: true,
              requires_user_action: true,
            }),
          }
        }
      }),
      getQueuedCommand: vi.fn(async () => stored),
    })

    const result = await service.writeRawMaterial({
      itemId: 'material-1',
      operationType: 'issue',
      quantity: 2,
      projectId: 'project-1',
      operationDate: '2026-09-08',
      employeeId: 'employee-1',
      requestId: 'raw-conflict',
    })

    expect(result).toMatchObject({
      status: 'conflict',
      commandId: 'raw-conflict',
      error: {
        code: 'insufficient_stock',
        retryable: true,
        requiresUserAction: true,
      },
    })
  })

  it('keeps web custody add and scrap on their existing direct RPC executors', async () => {
    const { dependencies, service } = setup({ isDesktop: () => false })
    const addInput = {
      employeeId: 'employee-1',
      tableName: 'inventory_items',
      itemId: 'item-1',
      receivedDate: '2026-09-08',
      sourceIssueOperationId: null,
      quantity: 1,
      requestId: 'web-custody-add',
    }
    const scrapInput = {
      custodyId: 'custody-1',
      scrappedDate: '2026-09-08',
      reason: 'damaged',
      requestId: 'web-custody-scrap',
    }

    const addResult = await service.writeCustodyAdd(addInput)
    const scrapResult = await service.writeCustodyScrap(scrapInput)

    expect(dependencies.writeCustodyAddDirect).toHaveBeenCalledWith(addInput)
    expect(dependencies.writeCustodyScrapDirect).toHaveBeenCalledWith(scrapInput)
    expect(dependencies.enqueue).not.toHaveBeenCalled()
    expect(dependencies.replay).not.toHaveBeenCalled()
    expect(addResult).toEqual({ status: 'synced', commandId: 'web-custody-add', runtime: 'web' })
    expect(scrapResult).toEqual({ status: 'synced', commandId: 'web-custody-scrap', runtime: 'web' })
  })

  it('queues source-linked and manual custody adds without inventory or custody RPC calls', async () => {
    const { dependencies, service } = setup()

    await service.writeCustodyAdd({
      employeeId: 'employee-1',
      tableName: 'consumables',
      itemId: 'item-1',
      receivedDate: null,
      sourceIssueOperationId: 'issue-1',
      requestId: 'linked-command',
    })
    await service.writeCustodyAdd({
      employeeId: 'employee-1',
      tableName: 'inventory_items',
      itemId: 'item-2',
      receivedDate: '2026-09-08',
      sourceIssueOperationId: null,
      quantity: 2,
      requestId: 'manual-command',
    })

    expect(dependencies.enqueue).toHaveBeenNthCalledWith(1, expect.objectContaining({
      commandId: 'linked-command',
      commandType: 'custody_add',
      payload: expect.objectContaining({
        received_date: null,
        source_issue_operation_id: 'issue-1',
        quantity: 1,
      }),
    }))
    expect(dependencies.enqueue).toHaveBeenNthCalledWith(2, expect.objectContaining({
      commandId: 'manual-command',
      commandType: 'custody_add',
      payload: expect.objectContaining({
        received_date: '2026-09-08',
        source_issue_operation_id: null,
        quantity: 2,
      }),
    }))
    expect(dependencies.writeCustodyAddDirect).not.toHaveBeenCalled()
    expect(dependencies.writeInventoryDirect).not.toHaveBeenCalled()
    expect(dependencies.writeReturnDirect).not.toHaveBeenCalled()
    expect(dependencies.replay).not.toHaveBeenCalled()
  })

  it('queues custody scrap offline without deleting or mutating local data', async () => {
    const { dependencies, service } = setup()

    const result = await service.writeCustodyScrap({
      custodyId: 'custody-1',
      scrappedDate: '2026-09-08',
      reason: 'damaged',
      requestId: 'scrap-command',
    })

    expect(dependencies.enqueue).toHaveBeenCalledWith({
      commandId: 'scrap-command',
      commandType: 'custody_scrap',
      contractVersion: 1,
      payload: {
        custody_id: 'custody-1',
        scrapped_date: '2026-09-08',
        reason: 'damaged',
      },
    })
    expect(dependencies.writeCustodyScrapDirect).not.toHaveBeenCalled()
    expect(dependencies.writeDeleteDirect).not.toHaveBeenCalled()
    expect(result.status).toBe('queued')
  })

  it('replays custody online and maps its persisted conflict', async () => {
    let stored: OfflineCommand | null = null
    const { dependencies, service } = setup({
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
              code: 'custody_already_scrapped',
              message: 'Custody is already scrapped.',
              sqlstate: 'P0001',
              retryable: false,
              requires_user_action: true,
            }),
          }
        }
      }),
      getQueuedCommand: vi.fn(async () => stored),
    })

    const result = await service.writeCustodyScrap({
      custodyId: 'custody-1',
      scrappedDate: '2026-09-08',
      reason: 'damaged',
      requestId: 'scrap-conflict',
    })

    expect(dependencies.replay).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      status: 'conflict',
      commandId: 'scrap-conflict',
      error: {
        code: 'custody_already_scrapped',
        retryable: false,
        requiresUserAction: true,
      },
    })
  })

  it('collapses an identical custody command id while it is in flight', async () => {
    let finishEnqueue: ((command: OfflineCommand) => void) | undefined
    const enqueue = vi.fn((input: EnqueueCommandInput) => new Promise<OfflineCommand>((resolve) => {
      finishEnqueue = resolve
      void input
    }))
    const { service } = setup({ enqueue })
    const input = {
      custodyId: 'custody-1',
      scrappedDate: '2026-09-08',
      reason: 'damaged',
      requestId: 'same-custody-command',
    }

    const first = service.writeCustodyScrap(input)
    const second = service.writeCustodyScrap(input)
    expect(enqueue).toHaveBeenCalledTimes(1)
    finishEnqueue?.(queuedCommand({
      commandId: 'same-custody-command',
      commandType: 'custody_scrap',
      contractVersion: 1,
      payload: {},
    }))

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
  })
})
