import { describe, expect, it, vi } from 'vitest'
import { buildRawMaterialOperationCommand } from './rawMaterialCommandBuilder'

const base = {
  itemId: 'material-1',
  quantity: 5,
  projectId: 'project-1',
  operationDate: '2026-09-08',
  itemCode: ' RM-1 ',
  notes: ' raw note ',
}

describe('raw-material v1 command builder', () => {
  it('builds the exact add payload without using inventory_operation', () => {
    const command = buildRawMaterialOperationCommand({
      ...base,
      operationType: 'add',
      supplierId: 'supplier-1',
      receivedBy: ' Receiver ',
      purchaseOrderNumber: ' PO-8 ',
      requestId: 'raw-add-command',
    })

    expect(command).toEqual({
      commandId: 'raw-add-command',
      commandType: 'raw_material_operation',
      contractVersion: 1,
      payload: {
        item_id: 'material-1',
        operation_type: 'add',
        quantity: 5,
        project_id: 'project-1',
        operation_date: '2026-09-08',
        employee_id: null,
        supplier_id: 'supplier-1',
        received_by: 'Receiver',
        purchase_order_number: 'PO-8',
        item_code: 'RM-1',
        notes: 'raw note',
        employee_ids: [],
      },
    })
  })

  it('preserves single and ordered group employee fields for issue', () => {
    const employeeIds = ['employee-2', 'employee-1']
    const command = buildRawMaterialOperationCommand({
      ...base,
      operationType: 'issue',
      employeeId: 'employee-primary',
      employeeIds,
      supplierId: 'ignored-supplier',
      receivedBy: 'ignored receiver',
      purchaseOrderNumber: 'ignored order',
      requestId: 'raw-issue-command',
    })
    employeeIds.reverse()

    expect(command.commandType).toBe('raw_material_operation')
    expect(command.payload).toMatchObject({
      operation_type: 'issue',
      employee_id: 'employee-primary',
      employee_ids: ['employee-2', 'employee-1'],
      supplier_id: null,
      received_by: null,
      purchase_order_number: null,
    })
  })

  it('requires project, supplier, and issue recipient before queueing', () => {
    expect(() => buildRawMaterialOperationCommand({
      ...base,
      operationType: 'add',
      projectId: '',
      supplierId: 'supplier-1',
    })).toThrow('المشروع مطلوب')
    expect(() => buildRawMaterialOperationCommand({
      ...base,
      operationType: 'add',
    })).toThrow('المورد مطلوب')
    expect(() => buildRawMaterialOperationCommand({
      ...base,
      operationType: 'issue',
    })).toThrow('الموظف مطلوب')
    expect(() => buildRawMaterialOperationCommand({
      ...base,
      operationType: 'adjust' as 'add',
      supplierId: 'supplier-1',
    })).toThrow('supports add or issue only')
  })

  it('generates the command id once only when no request id exists', () => {
    const createCommandId = vi.fn(() => 'generated-raw-command')
    const command = buildRawMaterialOperationCommand({
      ...base,
      operationType: 'add',
      supplierId: 'supplier-1',
    }, createCommandId)

    expect(createCommandId).toHaveBeenCalledTimes(1)
    expect(command.commandId).toBe('generated-raw-command')
  })
})
