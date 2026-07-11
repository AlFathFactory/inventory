import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'

export type InventoryOperationType = 'add' | 'issue' | 'adjust'

export type ApplyInventoryOperationParams = {
  tableName: string
  categoryName: string
  itemId: string
  itemName: string
  operationType: InventoryOperationType
  quantity: number
  operationDate: string
  projectName?: string
  itemCode?: string
  supplierName?: string
  purchaseOrderNumber?: string
  issuedTo?: string
  notes?: string
}

export type RecentInventoryOperation = {
  id: string
  code: string
  operationType: InventoryOperationType
  categoryName: string
  itemName: string
  quantity: number
  projectName: string
  operationDate: string
  supplierName: string
  issuedTo: string
  previousBalance: number | null
  newBalance: number | null
  notes: string
}

type OperationRecord = Record<string, unknown>

function getClientOrThrow() {
  if (!isSupabaseConfigured || !supabaseClient) {
    throw new Error(getSupabaseConfigError())
  }

  return supabaseClient
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return 0
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return ''
}

function normalizeOperationType(value: unknown): InventoryOperationType {
  return value === 'issue' || value === 'adjust' ? value : 'add'
}

function getCodeFromRecord(record: OperationRecord) {
  return (
    toText(record.addition_code) ||
    toText(record.issue_code) ||
    toText(record.adjustment_code) ||
    toText(record.code) ||
    '—'
  )
}

function getOperationTimestamp(record: OperationRecord) {
  return (
    toText(record.operation_date) ||
    toText(record.created_at) ||
    toText(record.transaction_date)
  )
}

function normalizeHistoryRecord(record: OperationRecord): RecentInventoryOperation {
  return {
    id:
      toText(record.id) ||
      `${getCodeFromRecord(record)}-${getOperationTimestamp(record)}-${toText(record.item_id)}`,
    code: getCodeFromRecord(record),
    operationType: normalizeOperationType(record.operation_type),
    categoryName:
      toText(record.category_name) || toText(record.category_label) || '—',
    itemName: toText(record.item_name) || toText(record.item_label) || '—',
    quantity: toNumber(record.quantity),
    projectName: toText(record.project_name) || toText(record.project),
    operationDate: toText(record.operation_date) || toText(record.created_at),
    supplierName: toText(record.supplier_name),
    issuedTo: toText(record.issued_to) || toText(record.received_by),
    previousBalance: toOptionalNumber(record.previous_balance),
    newBalance: toOptionalNumber(record.new_balance),
    notes: toText(record.notes),
  }
}

function sortOperationsByDateDesc(
  left: RecentInventoryOperation,
  right: RecentInventoryOperation,
) {
  return (
    new Date(right.operationDate || 0).getTime() -
    new Date(left.operationDate || 0).getTime()
  )
}

export async function applyInventoryOperation(
  params: ApplyInventoryOperationParams,
) {
  const client = getClientOrThrow()
  const quantity = Number(params.quantity)

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('الكمية مطلوبة ويجب أن تكون أكبر من صفر')
  }

  const { data: selectedItem, error: fetchError } = await client
    .from(params.tableName)
    .select('*')
    .eq('id', params.itemId)
    .single()

  if (fetchError || !selectedItem) {
    throw new Error(fetchError?.message || 'تعذر تحميل بيانات الصنف المحدد')
  }

  const currentBalance = toNumber(selectedItem.stock_balance ?? selectedItem.gas_balance)
  const currentTotalAdded = toNumber(selectedItem.total_added)
  const currentTotalIssued = toNumber(selectedItem.total_issued)
  const stockField =
    'stock_balance' in selectedItem
      ? 'stock_balance'
      : 'gas_balance' in selectedItem
        ? 'gas_balance'
        : 'stock_balance'

  let newBalance = currentBalance
  let updatePayload: Record<string, number> = {}

  if (params.operationType === 'add') {
    newBalance = currentBalance + quantity
    updatePayload = {
      added: quantity,
      total_added: currentTotalAdded + quantity,
      [stockField]: newBalance,
    }
  }

  if (params.operationType === 'issue') {
    if (quantity > currentBalance) {
      throw new Error('الكمية المصروفة أكبر من الرصيد الحالي')
    }

    newBalance = currentBalance - quantity
    updatePayload = {
      issued: quantity,
      total_issued: currentTotalIssued + quantity,
      [stockField]: newBalance,
    }
  }

  if (params.operationType === 'adjust') {
    newBalance = quantity
    updatePayload = {
      [stockField]: newBalance,
    }
  }

  const { error: updateError } = await client
    .from(params.tableName)
    .update(updatePayload)
    .eq('id', params.itemId)

  if (updateError) {
    throw new Error(updateError.message || 'تعذر تحديث رصيد الصنف')
  }

  const { error: insertError } = await client.from('inventory_operations').insert({
    table_name: params.tableName,
    category_name: params.categoryName,
    category_label: params.categoryName,
    item_id: params.itemId,
    item_name: params.itemName,
    item_label: params.itemName,
    operation_type: params.operationType,
    quantity,
    project_name: params.projectName,
    project: params.projectName,
    item_code: params.itemCode,
    supplier_name: params.supplierName,
    purchase_order_number: params.purchaseOrderNumber,
    issued_to: params.issuedTo,
    received_by: params.issuedTo,
    operation_date: params.operationDate,
    previous_balance: currentBalance,
    new_balance: newBalance,
    notes: params.notes,
  })

  if (insertError) {
    throw new Error(insertError.message || 'تم تحديث الرصيد لكن تعذر حفظ الحركة')
  }

  return {
    previousBalance: currentBalance,
    newBalance,
  }
}

export async function getAdditionOperations(limit = 20) {
  const client = getClientOrThrow()
  const { data, error } = await client
    .from('addition_operations_view')
    .select('*')
    .order('operation_date', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message || 'تعذر تحميل سجل الإضافات')
  }

  return (data ?? []).map((row) =>
    normalizeHistoryRecord(row as OperationRecord),
  )
}

export async function getIssueOperations(limit = 20) {
  const client = getClientOrThrow()
  const { data, error } = await client
    .from('issue_operations_view')
    .select('*')
    .order('operation_date', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(error.message || 'تعذر تحميل سجل الصرف')
  }

  return (data ?? []).map((row) =>
    normalizeHistoryRecord(row as OperationRecord),
  )
}

export async function getRecentInventoryOperations(limit = 20) {
  const client = getClientOrThrow()

  const [{ data: adjustmentRows, error: adjustmentError }, additions, issues] =
    await Promise.all([
      client
        .from('inventory_operations')
        .select('*')
        .eq('operation_type', 'adjust')
        .order('operation_date', { ascending: false })
        .limit(limit),
      getAdditionOperations(limit),
      getIssueOperations(limit),
    ])

  if (adjustmentError) {
    throw new Error(adjustmentError.message || 'تعذر تحميل سجل الجرد')
  }

  return [
    ...additions,
    ...issues,
    ...(adjustmentRows ?? []).map((row) =>
      normalizeHistoryRecord(row as OperationRecord),
    ),
  ]
    .sort(sortOperationsByDateDesc)
    .slice(0, limit)
}
