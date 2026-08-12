import {
  applyInventoryOperation,
  returnInventoryItem,
  type ApplyInventoryOperationParams,
  type InventoryOperationType,
  type ReturnInventoryOperationParams,
} from '../../services/operationsService'
import type { DynamicCategory, DynamicCategoryItem } from './types'

export type DynamicStockOperationInput = {
  category: DynamicCategory
  item: DynamicCategoryItem
  operationType: InventoryOperationType
  quantity: number
  operationDate: string
  requestId: string
  supplierName?: string
  supplierId?: string | null
  purchaseOrderNumber?: string
  issuedTo?: string
  employeeId?: string | null
  employeeIds?: string[]
  employeeSelections?: Array<{ id: string; name: string }>
  notes?: string
  createdBy?: string
}

export type DynamicReturnInput = {
  issueOperationId: string
  quantity: number
  operationDate: string
  receivedBy?: string
  notes?: string
  createdBy?: string
  requestId: string
  employeeId?: string | null
}

type OperationExecutor = (params: ApplyInventoryOperationParams) => Promise<unknown>
type ReturnExecutor = (params: ReturnInventoryOperationParams) => Promise<unknown>

function requireOnline() {
  if (!navigator.onLine) {
    throw new Error('عمليات أصناف التصنيفات الديناميكية تتطلب اتصالًا بالإنترنت حاليًا.')
  }
}

function requireRequestId(requestId: string) {
  if (!requestId.trim()) throw new Error('معرّف الطلب مطلوب لحماية العملية من التكرار.')
  return requestId
}

export async function applyDynamicItemStockOperation(
  input: DynamicStockOperationInput,
  executor: OperationExecutor = applyInventoryOperation,
) {
  requireOnline()
  const requestId = requireRequestId(input.requestId)
  return executor({
    tableName: 'inventory_items',
    categoryName: input.category.name,
    itemId: input.item.id,
    itemName: input.item.item_name,
    operationType: input.operationType,
    quantity: input.quantity,
    operationDate: input.operationDate,
    projectName: input.item.project || undefined,
    itemCode: input.item.internal_code,
    supplierName: input.operationType === 'add' ? input.supplierName : undefined,
    supplierId: input.operationType === 'add' ? input.supplierId : null,
    purchaseOrderNumber:
      input.operationType === 'add' ? input.purchaseOrderNumber : undefined,
    issuedTo: input.operationType === 'issue' ? input.issuedTo : undefined,
    employeeId: input.operationType === 'issue' ? input.employeeId : null,
    employeeIds: input.operationType === 'issue' ? input.employeeIds : undefined,
    employeeSelections:
      input.operationType === 'issue' ? input.employeeSelections : undefined,
    notes: input.notes,
    createdBy: input.createdBy,
    requestId,
  })
}

export async function returnDynamicItemStock(
  input: DynamicReturnInput,
  executor: ReturnExecutor = returnInventoryItem,
) {
  requireOnline()
  const requestId = requireRequestId(input.requestId)
  return executor({
    issueOperationId: input.issueOperationId,
    quantity: input.quantity,
    operationDate: input.operationDate,
    receivedBy: input.receivedBy,
    notes: input.notes,
    createdBy: input.createdBy,
    requestId,
    employeeId: input.employeeId,
  })
}
