import type {
  EnqueueCommandInput,
  OfflineCommandPayload,
} from '../../lib/localDb/models/offlineCommand'
import type {
  AddEmployeeCustodyInput,
  ScrapEmployeeCustodyInput,
} from '../../features/employee-custody/types'

type CommandIdFactory = () => string

export type CustodyAddCommandEnvelope = EnqueueCommandInput & {
  commandId: string
  commandType: 'custody_add'
  contractVersion: 1
}

export type CustodyScrapCommandEnvelope = EnqueueCommandInput & {
  commandId: string
  commandType: 'custody_scrap'
  contractVersion: 1
}

function requiredText(value: string, field: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function commandIdFor(requestId: string | undefined, createCommandId: CommandIdFactory) {
  return requestId ?? createCommandId()
}

export function buildCustodyAddCommand(
  input: AddEmployeeCustodyInput,
  createCommandId: CommandIdFactory = () => crypto.randomUUID(),
): CustodyAddCommandEnvelope {
  const employeeId = requiredText(input.employeeId, 'employee_id')
  const tableName = requiredText(input.tableName, 'table_name')
  const itemId = requiredText(input.itemId, 'item_id')
  const sourceIssueOperationId = input.sourceIssueOperationId?.trim() || null
  const receivedDate = input.receivedDate?.trim() || null
  if (!sourceIssueOperationId && !receivedDate) {
    throw new Error('received_date is required for manual custody.')
  }

  const quantity = Number(input.quantity ?? 1)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('quantity must be greater than zero.')
  }

  const payload: OfflineCommandPayload = {
    employee_id: employeeId,
    table_name: tableName,
    item_id: itemId,
    received_date: receivedDate,
    source_issue_operation_id: sourceIssueOperationId,
    quantity,
    notes: input.notes?.trim() || null,
  }
  return {
    commandId: commandIdFor(input.requestId, createCommandId),
    commandType: 'custody_add',
    contractVersion: 1,
    payload,
  }
}

export function buildCustodyScrapCommand(
  input: ScrapEmployeeCustodyInput,
  createCommandId: CommandIdFactory = () => crypto.randomUUID(),
): CustodyScrapCommandEnvelope {
  const payload: OfflineCommandPayload = {
    custody_id: requiredText(input.custodyId, 'custody_id'),
    scrapped_date: requiredText(input.scrappedDate, 'scrapped_date'),
    reason: requiredText(input.reason, 'reason'),
  }
  return {
    commandId: commandIdFor(input.requestId, createCommandId),
    commandType: 'custody_scrap',
    contractVersion: 1,
    payload,
  }
}
