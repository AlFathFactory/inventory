import { describe, expect, it, vi } from 'vitest'
import {
  buildInventoryAddCommand,
  buildInventoryAdjustCommand,
  buildInventoryIssueCommand,
} from './inventoryCommandBuilders'

const base = {
  requestId: 'command-1',
  tableName: 'consumables',
  categoryName: 'Consumables',
  itemId: 'item-1',
  itemName: 'Gloves',
  quantity: 4,
  operationDate: '2026-09-07',
  projectName: 'Project A',
  itemCode: 'CON-001',
  purchaseOrderNumber: 'PO-9',
  notes: 'note',
}

describe('inventory v1 command builders', () => {
  it('builds an add payload with the backend v1 field names', () => {
    const command = buildInventoryAddCommand({
      ...base,
      supplierId: 'supplier-1',
      receivedBy: 'Receiver',
    })

    expect(command).toEqual({
      commandId: 'command-1',
      commandType: 'inventory_operation',
      contractVersion: 1,
      payload: {
        table_name: 'consumables',
        item_id: 'item-1',
        operation_type: 'add',
        quantity: 4,
        operation_date: '2026-09-07',
        project_name: 'Project A',
        category_name: 'Consumables',
        item_name: 'Gloves',
        employee_id: null,
        employee_ids: null,
        supplier_id: 'supplier-1',
        received_by: 'Receiver',
        purchase_order_number: 'PO-9',
        item_code: 'CON-001',
        notes: 'note',
      },
    })
  })

  it('preserves both single and group employee fields for an issue', () => {
    const employeeIds = ['employee-1', 'employee-2']
    const command = buildInventoryIssueCommand({
      ...base,
      employeeId: 'employee-primary',
      employeeIds,
      supplierId: 'ignored-supplier',
    })

    employeeIds.push('late-mutation')

    expect(command.payload).toMatchObject({
      operation_type: 'issue',
      employee_id: 'employee-primary',
      employee_ids: ['employee-1', 'employee-2'],
      supplier_id: null,
    })
  })

  it('builds an adjustment and generates its command id exactly once', () => {
    const createCommandId = vi.fn(() => 'generated-command')
    const command = buildInventoryAdjustCommand({
      ...base,
      requestId: undefined,
      quantity: 0,
      supplierId: 'ignored-supplier',
      employeeId: 'ignored-employee',
      employeeIds: ['ignored-1', 'ignored-2'],
    }, createCommandId)

    expect(createCommandId).toHaveBeenCalledTimes(1)
    expect(command.commandId).toBe('generated-command')
    expect(command.payload).toMatchObject({
      operation_type: 'adjust',
      quantity: 0,
      employee_id: null,
      employee_ids: null,
      supplier_id: null,
    })
  })

  it('keeps supplier and employee validation at the command boundary', () => {
    expect(() => buildInventoryAddCommand(base)).toThrow('مورد نشط')
    expect(() => buildInventoryIssueCommand(base)).toThrow('موظف نشط')
  })
})
