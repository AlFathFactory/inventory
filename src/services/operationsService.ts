import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'
import { saveOfflineOperation } from './offlineQueueService'
import { isStockInventoryTable } from './inventoryTablePolicy'
import { getCategorySummaryItems } from './itemsService'

export type InventoryOperationType = 'add' | 'issue' | 'adjust'

export type ApplyInventoryOperationParams = {
  tableName: string
  categoryName: string
  itemId: string | number
  itemName: string
  operationType: InventoryOperationType
  quantity: number
  operationDate: string
  projectName?: string
  itemCode?: string | null
  supplierName?: string
  purchaseOrderNumber?: string
  issuedTo?: string
  receivedBy?: string
  notes?: string
  createdBy?: string
  localItemId?: string | null
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

export type InventoryReportFilters = {
  fromDate?: string
  toDate?: string
  categoryName?: string
  projectName?: string
}

export type InventoryReportRow = {
  id: string
  itemName: string
  categoryName: string
  projectName: string
  operationType: 'add' | 'issue'
  quantity: number
  operationDate: string
  codeNumber: string | null
  weight: number | string | null
  length: number | string | null
  width: number | string | null
  th: number | string | null
}

export type InventoryReport = {
  rows: InventoryReportRow[]
  summary: {
    additionOperationsCount: number
    totalAddedQuantity: number
    issueOperationsCount: number
    totalIssuedQuantity: number
  }
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

function getOperationErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase()

  if (
    normalizedMessage.includes('insufficient stock') ||
    normalizedMessage.includes('insufficient balance') ||
    normalizedMessage.includes('quantity exceeds') ||
    normalizedMessage.includes('negative stock')
  ) {
    return 'الكمية المصروفة أكبر من الرصيد الحالي'
  }

  if (
    normalizedMessage.includes('item not found') ||
    normalizedMessage.includes('no inventory item')
  ) {
    return 'الصنف المحدد غير موجود أو تعذر الوصول إليه'
  }

  return message || 'فشل تنفيذ حركة المخزون'
}

export async function applyInventoryOperation(
  params: ApplyInventoryOperationParams,
) {
  const quantity = Number(params.quantity)

  if (!params.tableName || params.itemId === null || params.itemId === undefined || String(params.itemId).trim() === '') {
    throw new Error('بيانات الصنف غير مكتملة، برجاء تحديث الصفحة والمحاولة مرة أخرى')
  }

  if (!isStockInventoryTable(params.tableName)) {
    throw new Error(`Unsupported inventory table: ${params.tableName}`)
  }

  if (
    !Number.isFinite(quantity) ||
    (params.operationType === 'adjust' ? quantity < 0 : quantity <= 0)
  ) {
    throw new Error(
      params.operationType === 'adjust'
        ? 'الرصيد الفعلي يجب أن يكون صفراً أو أكبر'
        : 'الكمية مطلوبة ويجب أن تكون أكبر من صفر',
    )
  }

  if (!navigator.onLine) {
    await saveOfflineOperation({
      tableName: params.tableName,
      itemId: params.localItemId ? null : params.itemId,
      localItemId: params.localItemId,
      operationType: params.operationType,
      quantity,
      payload: {
        operationDate: params.operationDate,
        projectName: params.projectName ?? null,
        categoryName: params.categoryName ?? null,
        itemName: params.itemName,
        supplierName: params.supplierName ?? null,
        purchaseOrderNumber: params.purchaseOrderNumber ?? null,
        issuedTo: params.issuedTo ?? null,
        receivedBy: params.receivedBy ?? null,
        itemCode: params.itemCode ?? null,
        notes: params.notes ?? null,
        createdBy: 'offline-user',
      },
    })
    return { ok: true, offline: true }
  }

  const client = getClientOrThrow()

  const { data, error } = await client.rpc(
    'apply_inventory_operation_transactional_rpc',
    {
      p_table_name: params.tableName,
      p_item_id: params.itemId,
      p_operation_type: params.operationType,
      p_quantity: quantity,
      p_operation_date: params.operationDate,
      p_project_name: params.projectName || null,
      p_category_name: params.categoryName || null,
      p_item_name: params.itemName || null,
      p_supplier_name: params.supplierName || null,
      p_issued_to: params.issuedTo || null,
      p_received_by: params.receivedBy || params.issuedTo || null,
      p_purchase_order_number: params.purchaseOrderNumber || null,
      p_item_code: params.itemCode || null,
      p_notes: params.notes || null,
      p_created_by: params.createdBy || 'user',
    },
  )

  if (error) {
    throw new Error(getOperationErrorMessage(error.message))
  }

  if (!data || typeof data !== 'object' || !('ok' in data) || !data.ok) {
    throw new Error('فشل تنفيذ حركة المخزون')
  }

  return data
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

export async function getInventoryReport(
  filters: InventoryReportFilters = {},
): Promise<InventoryReport> {
  const client = getClientOrThrow()
  const pageSize = 1000
  const records: OperationRecord[] = []

  for (let from = 0; ; from += pageSize) {
    let query = client
      .from('inventory_operations')
      .select('id,table_name,item_id,item_name,item_label,category_name,category_label,project_name,project,operation_type,quantity,operation_date,item_code')
      .in('operation_type', ['add', 'issue'])
      .order('operation_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)

    if (filters.fromDate) {
      query = query.gte('operation_date', filters.fromDate)
    }
    if (filters.toDate) {
      query = query.lte('operation_date', filters.toDate)
    }
    if (filters.categoryName) {
      query = query.eq('category_name', filters.categoryName)
    }
    if (filters.projectName) {
      query = query.eq('project_name', filters.projectName)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(error.message || 'تعذر تحميل بيانات التقارير')
    }

    const page = (data ?? []) as OperationRecord[]
    records.push(...page)
    if (page.length < pageSize) break
  }

  const hasRawMaterialRows = records.some(
    (record) => toText(record.table_name) === 'raw_materials',
  )
  const rawMaterialsById = new Map<string, Record<string, unknown>>()

  if (hasRawMaterialRows) {
    const result = await getCategorySummaryItems('raw_materials')
    if (result.data === null) {
      throw new Error(result.error)
    }
    for (const item of result.data) {
      rawMaterialsById.set(String(item.item_id), item)
    }
  }

  const rows: InventoryReportRow[] = records.map((record) => {
    const rawMaterial = rawMaterialsById.get(toText(record.item_id))
    return {
      id: toText(record.id),
      itemName: toText(record.item_name) || toText(record.item_label) || '—',
      categoryName:
        toText(record.category_name) || toText(record.category_label) || '—',
      projectName: toText(record.project_name) || toText(record.project) || '—',
      operationType: record.operation_type === 'issue' ? 'issue' : 'add',
      quantity: toNumber(record.quantity),
      operationDate: toText(record.operation_date),
      codeNumber:
        toText(rawMaterial?.code_number) || toText(record.item_code) || null,
      weight: rawMaterial?.weight as number | string | null | undefined ?? null,
      length: rawMaterial?.length as number | string | null | undefined ?? null,
      width: rawMaterial?.width as number | string | null | undefined ?? null,
      th: rawMaterial?.th as number | string | null | undefined ?? null,
    }
  })

  return {
    rows,
    summary: rows.reduce<InventoryReport['summary']>(
      (summary, row) => {
        if (row.operationType === 'add') {
          summary.additionOperationsCount += 1
          summary.totalAddedQuantity += row.quantity
        } else {
          summary.issueOperationsCount += 1
          summary.totalIssuedQuantity += row.quantity
        }
        return summary
      },
      {
        additionOperationsCount: 0,
        totalAddedQuantity: 0,
        issueOperationsCount: 0,
        totalIssuedQuantity: 0,
      },
    ),
  }
}
