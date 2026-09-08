import type {
  EnqueueCommandInput,
  OfflineCommandPayload,
} from '../../lib/localDb/models/offlineCommand'
import type {
  ApplyInventoryOperationParams,
  InventoryOperationType,
} from '../operationsService'
import { isStockInventoryTable } from '../inventoryTablePolicy'

export type InventoryCommandBuilderInput = Omit<
  ApplyInventoryOperationParams,
  'operationType'
>

export type InventoryCommandEnvelope = EnqueueCommandInput & {
  commandId: string
  commandType: 'inventory_operation'
  contractVersion: 1
}

type CommandIdFactory = () => string

function validateCommandInput(
  operationType: InventoryOperationType,
  input: InventoryCommandBuilderInput,
) {
  const quantity = Number(input.quantity)
  const isDynamicInventoryItem = input.tableName === 'inventory_items'
  if (
    !input.tableName
    || input.itemId === null
    || input.itemId === undefined
    || String(input.itemId).trim() === ''
  ) {
    throw new Error('بيانات الصنف غير مكتملة، برجاء تحديث الصفحة والمحاولة مرة أخرى')
  }
  if (!isStockInventoryTable(input.tableName) && !isDynamicInventoryItem) {
    throw new Error(`Unsupported inventory table: ${input.tableName}`)
  }
  if (!Number.isFinite(quantity) || (operationType === 'adjust' ? quantity < 0 : quantity <= 0)) {
    throw new Error(
      operationType === 'adjust'
        ? 'الرصيد الفعلي يجب أن يكون صفراً أو أكبر'
        : 'الكمية مطلوبة ويجب أن تكون أكبر من صفر',
    )
  }
  if (operationType === 'issue' && !input.employeeId && (input.employeeIds?.length ?? 0) < 2) {
    throw new Error('يجب اختيار موظف نشط قبل تنفيذ الصرف')
  }
  if (operationType === 'add' && !input.supplierId) {
    throw new Error('يجب اختيار مورد نشط قبل تنفيذ الإضافة')
  }
}

function commandIdFor(input: InventoryCommandBuilderInput, createCommandId: CommandIdFactory) {
  return input.requestId ?? createCommandId()
}

function buildPayload(
  operationType: InventoryOperationType,
  input: InventoryCommandBuilderInput,
): OfflineCommandPayload {
  const payload: OfflineCommandPayload = {
    table_name: input.tableName,
    item_id: input.itemId,
    operation_type: operationType,
    quantity: Number(input.quantity),
    operation_date: input.operationDate,
    project_name: input.projectName || null,
    category_name: input.categoryName || null,
    item_name: input.itemName || null,
    employee_id: operationType === 'issue' ? input.employeeId || null : null,
    supplier_id: operationType === 'add' ? input.supplierId || null : null,
    received_by: input.receivedBy || null,
    purchase_order_number: input.purchaseOrderNumber || null,
    item_code: input.itemCode || null,
    notes: input.notes || null,
  }

  // Only group issues carry `employee_ids`, and the key must be absent
  // otherwise: the backend tests `payload ? 'employee_ids'`, which is true
  // even for a JSON null, and then rejects anything that is not an array.
  if (operationType === 'issue' && input.employeeIds && input.employeeIds.length > 0) {
    payload.employee_ids = [...input.employeeIds]
  }

  return payload
}

function buildCommand(
  operationType: InventoryOperationType,
  input: InventoryCommandBuilderInput,
  createCommandId: CommandIdFactory,
): InventoryCommandEnvelope {
  validateCommandInput(operationType, input)
  return {
    commandId: commandIdFor(input, createCommandId),
    commandType: 'inventory_operation',
    contractVersion: 1,
    payload: buildPayload(operationType, input),
  }
}

export function buildInventoryAddCommand(
  input: InventoryCommandBuilderInput,
  createCommandId: CommandIdFactory = () => crypto.randomUUID(),
): InventoryCommandEnvelope {
  return buildCommand('add', input, createCommandId)
}

export function buildInventoryIssueCommand(
  input: InventoryCommandBuilderInput,
  createCommandId: CommandIdFactory = () => crypto.randomUUID(),
): InventoryCommandEnvelope {
  return buildCommand('issue', input, createCommandId)
}

export function buildInventoryAdjustCommand(
  input: InventoryCommandBuilderInput,
  createCommandId: CommandIdFactory = () => crypto.randomUUID(),
): InventoryCommandEnvelope {
  return buildCommand('adjust', input, createCommandId)
}

export function buildInventoryOperationCommand(
  input: ApplyInventoryOperationParams,
  createCommandId: CommandIdFactory = () => crypto.randomUUID(),
): InventoryCommandEnvelope {
  const commandInput: InventoryCommandBuilderInput = input
  if (input.operationType === 'add') {
    return buildInventoryAddCommand(commandInput, createCommandId)
  }
  if (input.operationType === 'issue') {
    return buildInventoryIssueCommand(commandInput, createCommandId)
  }
  return buildInventoryAdjustCommand(commandInput, createCommandId)
}
