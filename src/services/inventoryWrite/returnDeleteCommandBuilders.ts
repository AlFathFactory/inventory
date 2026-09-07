import type {
  EnqueueCommandInput,
  OfflineCommandPayload,
} from '../../lib/localDb/models/offlineCommand'
import type { ReturnInventoryOperationParams } from '../operationsService'

type CommandIdFactory = () => string

export type DeleteInventoryOperationParams = {
  operationId: string | number
  deletedBy?: string
  requestId?: string
}

export type ReturnCommandEnvelope = EnqueueCommandInput & {
  commandId: string
  commandType: 'return'
  contractVersion: 1
}

export type DeleteCommandEnvelope = EnqueueCommandInput & {
  commandId: string
  commandType: 'delete_operation'
  contractVersion: 1
}

function commandIdFor(requestId: string | undefined, createCommandId: CommandIdFactory) {
  return requestId ?? createCommandId()
}

function requireOperationId(operationId: string | number, field: string) {
  if (String(operationId).trim() === '') {
    throw new Error(`${field} is required.`)
  }
}

export function buildInventoryReturnCommand(
  input: ReturnInventoryOperationParams,
  createCommandId: CommandIdFactory = () => crypto.randomUUID(),
): ReturnCommandEnvelope {
  requireOperationId(input.issueOperationId, 'issue_operation_id')
  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('الكمية المرتجعة يجب أن تكون أكبر من صفر.')
  }
  if (!input.operationDate.trim()) {
    throw new Error('تاريخ المرتجع مطلوب')
  }

  const payload: OfflineCommandPayload = {
    issue_operation_id: input.issueOperationId,
    employee_id: input.employeeId || null,
    quantity,
    operation_date: input.operationDate,
    notes: input.notes?.trim() || null,
    received_by: input.receivedBy?.trim() || null,
  }
  return {
    commandId: commandIdFor(input.requestId, createCommandId),
    commandType: 'return',
    contractVersion: 1,
    payload,
  }
}

export function buildInventoryDeleteCommand(
  input: DeleteInventoryOperationParams,
  createCommandId: CommandIdFactory = () => crypto.randomUUID(),
): DeleteCommandEnvelope {
  requireOperationId(input.operationId, 'operation_id')
  return {
    commandId: commandIdFor(input.requestId, createCommandId),
    commandType: 'delete_operation',
    contractVersion: 1,
    payload: { operation_id: input.operationId },
  }
}
