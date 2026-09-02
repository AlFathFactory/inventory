import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabaseClient: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
  getSupabaseConfigError: () => 'not configured',
}))

import { applyRawMaterialOperationWithProject } from './rawMaterialsService'

describe('raw-material project operation service', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    rpcMock.mockResolvedValue({ data: { status: 'success' }, error: null })
    vi.stubGlobal('navigator', { onLine: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the dedicated add RPC with project id and stable request id', async () => {
    await applyRawMaterialOperationWithProject({
      itemId: 'material-1',
      operationType: 'add',
      quantity: 5,
      projectId: 'project-1',
      operationDate: '2026-09-02',
      supplierId: 'supplier-1',
      receivedBy: 'أمين المخزن',
      purchaseOrderNumber: 'PO-7',
      itemCode: 'D8',
      requestId: 'raw-add-request-id',
    })

    expect(rpcMock).toHaveBeenCalledWith(
      'apply_raw_material_operation_with_project_rpc',
      expect.objectContaining({
        p_item_id: 'material-1',
        p_operation_type: 'add',
        p_project_id: 'project-1',
        p_supplier_id: 'supplier-1',
        p_received_by: 'أمين المخزن',
        p_request_id: 'raw-add-request-id',
        p_employee_id: null,
        p_employee_ids: null,
      }),
    )
    expect(rpcMock.mock.calls[0]?.[1]).not.toHaveProperty('p_table_name')
  })

  it('passes employee ids for a group issue', async () => {
    await applyRawMaterialOperationWithProject({
      itemId: 'material-1',
      operationType: 'issue',
      quantity: 2,
      projectId: 'project-1',
      operationDate: '2026-09-02',
      employeeIds: ['employee-1', 'employee-2'],
      requestId: 'raw-issue-request-id',
    })

    expect(rpcMock).toHaveBeenCalledWith(
      'apply_raw_material_operation_with_project_rpc',
      expect.objectContaining({
        p_operation_type: 'issue',
        p_project_id: 'project-1',
        p_employee_id: null,
        p_employee_ids: ['employee-1', 'employee-2'],
        p_supplier_id: null,
        p_request_id: 'raw-issue-request-id',
      }),
    )
  })

  it('does not fall back to an offline queue', async () => {
    vi.stubGlobal('navigator', { onLine: false })

    await expect(applyRawMaterialOperationWithProject({
      itemId: 'material-1',
      operationType: 'add',
      quantity: 5,
      projectId: 'project-1',
      operationDate: '2026-09-02',
      supplierId: 'supplier-1',
      requestId: 'raw-add-request-id',
    })).rejects.toThrow('تتطلب اتصالًا بالإنترنت')
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
