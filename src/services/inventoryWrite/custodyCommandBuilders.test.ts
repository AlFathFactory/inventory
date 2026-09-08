import { describe, expect, it, vi } from 'vitest'
import {
  buildCustodyAddCommand,
  buildCustodyScrapCommand,
} from './custodyCommandBuilders'

describe('custody v1 command builders', () => {
  it('builds the exact source-linked add payload and lets the backend derive the date', () => {
    expect(buildCustodyAddCommand({
      employeeId: ' employee-1 ',
      tableName: ' consumables ',
      itemId: ' item-1 ',
      receivedDate: null,
      sourceIssueOperationId: ' issue-1 ',
      notes: ' linked note ',
      requestId: 'custody-add-linked',
    })).toEqual({
      commandId: 'custody-add-linked',
      commandType: 'custody_add',
      contractVersion: 1,
      payload: {
        employee_id: 'employee-1',
        table_name: 'consumables',
        item_id: 'item-1',
        received_date: null,
        source_issue_operation_id: 'issue-1',
        quantity: 1,
        notes: 'linked note',
      },
    })
  })

  it('builds the exact manual add payload and preserves its required date and quantity', () => {
    expect(buildCustodyAddCommand({
      employeeId: 'employee-1',
      tableName: 'inventory_items',
      itemId: 'item-2',
      receivedDate: '2026-09-08',
      sourceIssueOperationId: null,
      quantity: 2.5,
      requestId: 'custody-add-manual',
    })).toEqual({
      commandId: 'custody-add-manual',
      commandType: 'custody_add',
      contractVersion: 1,
      payload: {
        employee_id: 'employee-1',
        table_name: 'inventory_items',
        item_id: 'item-2',
        received_date: '2026-09-08',
        source_issue_operation_id: null,
        quantity: 2.5,
        notes: null,
      },
    })
  })

  it('requires a received date only for manual custody', () => {
    expect(() => buildCustodyAddCommand({
      employeeId: 'employee-1',
      tableName: 'inventory_items',
      itemId: 'item-2',
      receivedDate: null,
      sourceIssueOperationId: null,
    })).toThrow('received_date is required for manual custody')
  })

  it('builds the exact scrap payload without deleting a custody record', () => {
    expect(buildCustodyScrapCommand({
      custodyId: ' custody-1 ',
      scrappedDate: '2026-09-08',
      reason: ' damaged ',
      requestId: 'custody-scrap-command',
    })).toEqual({
      commandId: 'custody-scrap-command',
      commandType: 'custody_scrap',
      contractVersion: 1,
      payload: {
        custody_id: 'custody-1',
        scrapped_date: '2026-09-08',
        reason: 'damaged',
      },
    })
  })

  it('generates one stable command id only when a request id is absent', () => {
    const createCommandId = vi.fn(() => 'generated-custody-command')
    const command = buildCustodyScrapCommand({
      custodyId: 'custody-1',
      scrappedDate: '2026-09-08',
      reason: 'damaged',
    }, createCommandId)

    expect(createCommandId).toHaveBeenCalledTimes(1)
    expect(command.commandId).toBe('generated-custody-command')
  })
})
