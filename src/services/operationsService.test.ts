import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabaseClient: { rpc: (...args: unknown[]) => rpcMock(...args) },
  getSupabaseConfigError: () => 'not configured',
}))

vi.mock('./offlineQueueService', () => ({
  saveOfflineOperation: vi.fn(),
}))

import { applyInventoryOperation, returnInventoryItem } from './operationsService'

describe('inventory operation RPC request ids', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    rpcMock.mockResolvedValue({ data: { status: 'success' }, error: null })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('crypto', { randomUUID: () => 'generated-request-id' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes an existing request id when adding consumables stock', async () => {
    await applyInventoryOperation({
      requestId: 'consumables-add-request-id',
      tableName: 'consumables',
      categoryName: 'Consumables',
      itemId: 'consumable-1',
      itemName: 'Gloves',
      operationType: 'add',
      quantity: 10,
      operationDate: '2026-08-31',
      supplierId: 'supplier-1',
    })

    expect(rpcMock).toHaveBeenCalledWith(
      'apply_inventory_operation_with_party_rpc',
      expect.objectContaining({
        p_table_name: 'consumables',
        p_operation_type: 'add',
        p_request_id: 'consumables-add-request-id',
      }),
    )
  })

  it('passes request ids when issuing stock and returning part of it', async () => {
    await applyInventoryOperation({
      requestId: 'issue-request-id',
      tableName: 'consumables',
      categoryName: 'Consumables',
      itemId: 'consumable-1',
      itemName: 'Gloves',
      operationType: 'issue',
      quantity: 4,
      operationDate: '2026-08-31',
      employeeId: 'employee-1',
    })

    await returnInventoryItem({
      issueOperationId: 'issue-operation-1',
      quantity: 2,
      operationDate: '2026-08-31',
    })

    expect(rpcMock).toHaveBeenNthCalledWith(
      1,
      'apply_inventory_operation_with_party_rpc',
      expect.objectContaining({
        p_operation_type: 'issue',
        p_request_id: 'issue-request-id',
      }),
    )
    expect(rpcMock).toHaveBeenNthCalledWith(
      2,
      'return_inventory_item_with_employee_rpc',
      expect.objectContaining({
        p_issue_operation_id: 'issue-operation-1',
        p_quantity: 2,
        p_request_id: 'generated-request-id',
      }),
    )
  })

  it('generates and passes a request id when adding dynamic-category stock', async () => {
    await applyInventoryOperation({
      tableName: 'inventory_items',
      categoryName: 'Dynamic category',
      itemId: 'dynamic-item-1',
      itemName: 'Dynamic item',
      operationType: 'add',
      quantity: 3,
      operationDate: '2026-08-31',
      supplierId: 'supplier-1',
    })

    expect(rpcMock).toHaveBeenCalledWith(
      'apply_inventory_operation_with_party_rpc',
      expect.objectContaining({
        p_table_name: 'inventory_items',
        p_operation_type: 'add',
        p_request_id: 'generated-request-id',
      }),
    )
  })
})
