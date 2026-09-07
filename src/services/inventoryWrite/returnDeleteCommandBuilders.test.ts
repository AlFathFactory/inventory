import { describe, expect, it, vi } from 'vitest'
import {
  buildInventoryDeleteCommand,
  buildInventoryReturnCommand,
} from './returnDeleteCommandBuilders'

describe('return and delete v1 command builders', () => {
  it('builds the exact return envelope and preserves its request id', () => {
    const createCommandId = vi.fn(() => 'unused-id')
    const command = buildInventoryReturnCommand({
      issueOperationId: 'issue-operation-1',
      employeeId: 'employee-1',
      quantity: 2.5,
      operationDate: '2026-09-08',
      notes: '  inspected return  ',
      receivedBy: '  Store keeper  ',
      createdBy: 'web-user',
      requestId: 'return-command-1',
    }, createCommandId)

    expect(createCommandId).not.toHaveBeenCalled()
    expect(command).toEqual({
      commandId: 'return-command-1',
      commandType: 'return',
      contractVersion: 1,
      payload: {
        issue_operation_id: 'issue-operation-1',
        employee_id: 'employee-1',
        quantity: 2.5,
        operation_date: '2026-09-08',
        notes: 'inspected return',
        received_by: 'Store keeper',
      },
    })
    expect(command.payload).not.toHaveProperty('created_by')
  })

  it('generates a return command id once and retains nullable fields', () => {
    const createCommandId = vi.fn(() => 'generated-return-id')
    const command = buildInventoryReturnCommand({
      issueOperationId: 42,
      quantity: 1,
      operationDate: '2026-09-08',
    }, createCommandId)

    expect(createCommandId).toHaveBeenCalledTimes(1)
    expect(command.commandId).toBe('generated-return-id')
    expect(command.payload).toMatchObject({
      issue_operation_id: 42,
      employee_id: null,
      notes: null,
      received_by: null,
    })
  })

  it('builds delete with operation_id as its only payload field', () => {
    const command = buildInventoryDeleteCommand({
      operationId: 'operation-1',
      deletedBy: 'ignored-in-desktop-payload',
      requestId: 'delete-command-1',
    })

    expect(command).toEqual({
      commandId: 'delete-command-1',
      commandType: 'delete_operation',
      contractVersion: 1,
      payload: { operation_id: 'operation-1' },
    })
  })

  it('rejects invalid return and delete inputs before queueing', () => {
    expect(() => buildInventoryReturnCommand({
      issueOperationId: 'issue-1',
      quantity: 0,
      operationDate: '2026-09-08',
    })).toThrow('أكبر من صفر')
    expect(() => buildInventoryDeleteCommand({ operationId: '' })).toThrow('operation_id')
  })
})
