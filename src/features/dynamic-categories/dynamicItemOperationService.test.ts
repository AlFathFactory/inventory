import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ApplyInventoryOperationParams,
  ReturnInventoryOperationParams,
} from '../../services/operationsService'
import {
  applyDynamicItemStockOperation,
  returnDynamicItemStock,
} from './dynamicItemOperationService'
import type { DynamicCategory, DynamicCategoryItem } from './types'

const category: DynamicCategory = {
  id: 'category-1',
  name: 'مواد التعبئة',
  code_prefix: 'DC001',
  item_count: 1,
  is_archived: false,
  created_at: '2026-08-12T00:00:00Z',
  updated_at: null,
}

const item: DynamicCategoryItem = {
  id: 'item-1',
  category_id: category.id,
  item_name: 'رول تغليف',
  internal_code: 'DC001-001',
  project: 'خط الإنتاج',
  supplier_name: null,
  opening_balance: 10,
  stock_balance: 10,
  min_quantity: 2,
  added: 10,
  issued: 0,
  total_added: 10,
  total_issued: 0,
  notes: null,
  source_sheet: category.name,
  is_archived: false,
  transaction_date: null,
  created_at: '2026-08-12T00:00:00Z',
  updated_at: null,
}

describe('dynamic item stock operation sequence', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: true })
  })

  it('keeps add, issue, returns, and final-balance adjustment idempotent', async () => {
    let stock = 10
    let totalIssued = 0
    let issueReturned = 0
    let returnStatus = 'not_returned'
    const requests = new Map<string, unknown>()
    const movements: Array<Record<string, unknown>> = []

    const operationExecutor = async (params: ApplyInventoryOperationParams) => {
      const requestId = params.requestId || ''
      if (requests.has(requestId)) return requests.get(requestId)
      const previous = stock
      if (params.operationType === 'add') stock += params.quantity
      if (params.operationType === 'issue') {
        stock -= params.quantity
        totalIssued += params.quantity
      }
      if (params.operationType === 'adjust') stock = params.quantity
      const result = { status: 'success', previous_balance: previous, new_balance: stock }
      requests.set(requestId, result)
      movements.push({
        type: params.operationType,
        requestId,
        supplierId: params.supplierId,
        employeeId: params.employeeId,
        tableName: params.tableName,
        categoryName: params.categoryName,
        itemCode: params.itemCode,
      })
      return result
    }

    const returnExecutor = async (params: ReturnInventoryOperationParams) => {
      const requestId = params.requestId || ''
      if (requests.has(requestId)) return requests.get(requestId)
      const previous = stock
      stock += params.quantity
      issueReturned += params.quantity
      returnStatus = issueReturned >= 4 ? 'fully_returned' : 'partially_returned'
      const result = {
        status: 'success',
        previous_balance: previous,
        new_balance: stock,
        returned_quantity: issueReturned,
        return_status: returnStatus,
        remaining_returnable_quantity: Math.max(4 - issueReturned, 0),
      }
      requests.set(requestId, result)
      movements.push({ type: 'return', requestId, employeeId: params.employeeId })
      return result
    }

    const common = { category, item, operationDate: '2026-08-12', createdBy: 'tester' }

    await applyDynamicItemStockOperation({
      ...common,
      operationType: 'add',
      quantity: 5,
      requestId: 'add-1',
      supplierName: 'المورد الرئيسي',
      supplierId: 'supplier-1',
    }, operationExecutor)
    expect(stock).toBe(15)

    await applyDynamicItemStockOperation({
      ...common,
      operationType: 'add',
      quantity: 5,
      requestId: 'add-1',
      supplierName: 'المورد الرئيسي',
      supplierId: 'supplier-1',
    }, operationExecutor)
    expect(stock).toBe(15)
    expect(movements.filter((movement) => movement.type === 'add')).toHaveLength(1)

    await applyDynamicItemStockOperation({
      ...common,
      operationType: 'issue',
      quantity: 4,
      requestId: 'issue-1',
      issuedTo: 'أحمد',
      employeeId: 'employee-1',
    }, operationExecutor)
    expect(stock).toBe(11)
    expect(totalIssued).toBe(4)

    await returnDynamicItemStock({
      issueOperationId: 'issue-operation-1',
      quantity: 2,
      operationDate: '2026-08-12',
      requestId: 'return-1',
      employeeId: 'employee-1',
    }, returnExecutor)
    expect(stock).toBe(13)
    expect(returnStatus).toBe('partially_returned')

    await returnDynamicItemStock({
      issueOperationId: 'issue-operation-1',
      quantity: 2,
      operationDate: '2026-08-12',
      requestId: 'return-1',
      employeeId: 'employee-1',
    }, returnExecutor)
    expect(stock).toBe(13)
    expect(movements.filter((movement) => movement.type === 'return')).toHaveLength(1)

    const fullReturn = await returnDynamicItemStock({
      issueOperationId: 'issue-operation-1',
      quantity: 2,
      operationDate: '2026-08-12',
      requestId: 'return-2',
      employeeId: 'employee-1',
    }, returnExecutor) as { return_status: string; remaining_returnable_quantity: number }
    expect(stock).toBe(15)
    expect(fullReturn.return_status).toBe('fully_returned')
    expect(fullReturn.remaining_returnable_quantity).toBe(0)

    await applyDynamicItemStockOperation({
      ...common,
      operationType: 'adjust',
      quantity: 12,
      requestId: 'adjust-1',
      notes: 'الرصيد الفعلي',
    }, operationExecutor)
    expect(stock).toBe(12)

    expect(movements).toHaveLength(5)
    expect(movements[0]).toMatchObject({ supplierId: 'supplier-1' })
    expect(movements[1]).toMatchObject({ employeeId: 'employee-1' })
    expect(movements.every((movement) => movement.itemCode === undefined || movement.itemCode === item.internal_code)).toBe(true)
    expect(movements.filter((movement) => movement.tableName).every((movement) => movement.tableName === 'inventory_items')).toBe(true)
    expect(movements.filter((movement) => movement.categoryName).every((movement) => movement.categoryName === category.name)).toBe(true)
    expect(item.internal_code).toBe('DC001-001')
    expect(item.category_id).toBe('category-1')
  })

  it('does not silently queue dynamic operations while offline', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: false })
    await expect(
      applyDynamicItemStockOperation({
        category,
        item,
        operationType: 'add',
        quantity: 1,
        operationDate: '2026-08-12',
        requestId: 'offline-1',
        supplierId: 'supplier-1',
      }),
    ).rejects.toThrow('تتطلب اتصالًا بالإنترنت')
  })
})
