import type {
  EnqueueCommandInput,
  OfflineCommandPayload,
} from '../../lib/localDb/models/offlineCommand'
import type { RawMaterialOperationInput } from '../rawMaterialsService'

type CommandIdFactory = () => string

export type RawMaterialCommandInput = Omit<RawMaterialOperationInput, 'requestId'> & {
  requestId?: string
}

export type RawMaterialCommandEnvelope = EnqueueCommandInput & {
  commandId: string
  commandType: 'raw_material_operation'
  contractVersion: 1
}

function validateRawMaterialCommand(input: RawMaterialCommandInput) {
  if (input.operationType !== 'add' && input.operationType !== 'issue') {
    throw new Error('raw_material_operation supports add or issue only')
  }
  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('الكمية مطلوبة ويجب أن تكون أكبر من صفر')
  }
  if (!input.itemId.trim()) {
    throw new Error('بيانات الخامة غير مكتملة، برجاء تحديث الصفحة والمحاولة مرة أخرى')
  }
  if (!input.projectId.trim()) {
    throw new Error('المشروع مطلوب')
  }
  if (!input.operationDate) {
    throw new Error('التاريخ مطلوب')
  }
  if (input.operationType === 'add' && !input.supplierId) {
    throw new Error('المورد مطلوب لعملية الإضافة')
  }
  if (
    input.operationType === 'issue'
    && !input.employeeId
    && (input.employeeIds?.length ?? 0) < 2
  ) {
    throw new Error('الموظف مطلوب لعملية الصرف')
  }
}

export function buildRawMaterialOperationCommand(
  input: RawMaterialCommandInput,
  createCommandId: CommandIdFactory = () => crypto.randomUUID(),
): RawMaterialCommandEnvelope {
  validateRawMaterialCommand(input)
  const payload: OfflineCommandPayload = {
    item_id: input.itemId,
    operation_type: input.operationType,
    quantity: Number(input.quantity),
    project_id: input.projectId,
    operation_date: input.operationDate,
    employee_id: input.operationType === 'issue' ? input.employeeId || null : null,
    supplier_id: input.operationType === 'add' ? input.supplierId || null : null,
    received_by: input.operationType === 'add' ? input.receivedBy?.trim() || null : null,
    purchase_order_number: input.operationType === 'add'
      ? input.purchaseOrderNumber?.trim() || null
      : null,
    item_code: input.itemCode?.trim() || null,
    notes: input.notes?.trim() || null,
    employee_ids: input.operationType === 'issue'
      ? [...(input.employeeIds ?? [])]
      : [],
  }
  return {
    commandId: input.requestId ?? createCommandId(),
    commandType: 'raw_material_operation',
    contractVersion: 1,
    payload,
  }
}
