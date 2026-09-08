import { describe, expect, it, vi } from 'vitest'
import {
  buildInventoryIssueCommand,
  buildInventoryAddCommand,
} from './inventoryCommandBuilders'
import { buildRawMaterialOperationCommand } from './rawMaterialCommandBuilder'
import {
  parseCanonicalPayload,
  serializeCanonicalPayload,
} from '../../lib/localDb/offlineCommandSerialization'
import { createOfflineCommandReplayClient } from '../desktopQueueReplay/replayClient'
import type { OfflineCommand } from '../../lib/localDb/models/offlineCommand'

/**
 * Guards the `employee_ids` contract across the whole desktop path.
 *
 * The backend tests `payload ? 'employee_ids'`, which is true even for a JSON
 * null, and then rejects anything that is not an array. Sending null made
 * every ordinary single-employee issue fail with
 * "employee_ids must be an array".
 */

const base = {
  tableName: 'consumables',
  itemId: 'item-1',
  quantity: 2,
  operationDate: '2026-09-08',
  requestId: 'command-1',
}

function asCommand(payload: Record<string, unknown>): OfflineCommand {
  return {
    commandId: 'command-1',
    commandType: 'inventory_operation',
    contractVersion: 1,
    payload: payload as OfflineCommand['payload'],
    status: 'syncing',
    attempts: 1,
    lastError: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    syncedAt: null,
  }
}

describe('employee_ids queue serialization', () => {
  it('round-trips a single-employee issue through SQLite storage without gaining the key', () => {
    const command = buildInventoryIssueCommand({ ...base, employeeId: 'employee-1' })

    const stored = serializeCanonicalPayload(command.payload)
    const restored = parseCanonicalPayload(stored)

    expect(stored).not.toContain('employee_ids')
    expect(restored).not.toHaveProperty('employee_ids')
    expect(restored.employee_id).toBe('employee-1')
  })

  it('round-trips a group issue preserving the array and its order', () => {
    const command = buildInventoryIssueCommand({
      ...base,
      employeeId: 'employee-1',
      employeeIds: ['employee-3', 'employee-1', 'employee-2'],
    })

    const restored = parseCanonicalPayload(serializeCanonicalPayload(command.payload))

    expect(restored.employee_ids).toEqual(['employee-3', 'employee-1', 'employee-2'])
    expect(Array.isArray(restored.employee_ids)).toBe(true)
  })

  it('keeps the raw-material issue array an array through storage', () => {
    const command = buildRawMaterialOperationCommand({
      itemId: 'raw-1',
      operationType: 'issue',
      quantity: 3,
      projectId: 'project-1',
      operationDate: '2026-09-08',
      employeeId: 'employee-1',
      requestId: 'command-2',
    })

    const restored = parseCanonicalPayload(serializeCanonicalPayload(command.payload))

    expect(Array.isArray(restored.employee_ids)).toBe(true)
  })

  it('never stores a null, string or object employee_ids for any built command', () => {
    const commands = [
      buildInventoryIssueCommand({ ...base, employeeId: 'employee-1' }),
      buildInventoryIssueCommand({ ...base, employeeIds: ['a', 'b'] }),
      buildInventoryAddCommand({ ...base, supplierId: 'supplier-1' }),
      buildRawMaterialOperationCommand({
        itemId: 'raw-1', operationType: 'issue', quantity: 1,
        projectId: 'p1', operationDate: '2026-09-08',
        employeeId: 'employee-1', requestId: 'c3',
      }),
    ]

    for (const command of commands) {
      const restored = parseCanonicalPayload(serializeCanonicalPayload(command.payload))
      if ('employee_ids' in restored) {
        expect(Array.isArray(restored.employee_ids)).toBe(true)
      }
      expect(restored.employee_ids).not.toBeNull()
      expect(typeof restored.employee_ids).not.toBe('string')
    }
  })
})

describe('replay RPC argument shape', () => {
  function captureRpc() {
    const rpc = vi.fn(async () => ({ data: { ok: true }, error: null }))
    return { rpc, apply: createOfflineCommandReplayClient({ rpc }) }
  }

  it('sends the single-employee payload with no employee_ids key at all', async () => {
    const { rpc, apply } = captureRpc()
    const command = buildInventoryIssueCommand({ ...base, employeeId: 'employee-1' })

    await apply(asCommand(command.payload))

    const [functionName, params] = rpc.mock.calls[0]
    expect(functionName).toBe('apply_inventory_offline_command_rpc')
    expect(params.p_payload).not.toHaveProperty('employee_ids')
    expect(params).toMatchObject({
      p_command_id: 'command-1',
      p_command_type: 'inventory_operation',
      p_contract_version: 1,
    })
  })

  it('sends a group issue as a real JSON array in order', async () => {
    const { rpc, apply } = captureRpc()
    const command = buildInventoryIssueCommand({
      ...base, employeeIds: ['employee-2', 'employee-1'],
    })

    await apply(asCommand(command.payload))

    const payload = rpc.mock.calls[0][1].p_payload as Record<string, unknown>
    expect(Array.isArray(payload.employee_ids)).toBe(true)
    expect(payload.employee_ids).toEqual(['employee-2', 'employee-1'])
    // JSON.stringify is what actually crosses the wire.
    expect(JSON.stringify(payload)).toContain('"employee_ids":["employee-2","employee-1"]')
  })

  it('never puts a null employee_ids on the wire', async () => {
    const { rpc, apply } = captureRpc()
    const command = buildInventoryIssueCommand({ ...base, employeeId: 'employee-1' })

    await apply(asCommand(command.payload))

    expect(JSON.stringify(rpc.mock.calls[0][1].p_payload))
      .not.toContain('"employee_ids":null')
  })
})
