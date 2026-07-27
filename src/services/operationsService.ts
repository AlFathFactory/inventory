import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'
import { saveOfflineOperation } from './offlineQueueService'
import { isStockInventoryTable } from './inventoryTablePolicy'

export type InventoryOperationType = 'add' | 'issue' | 'adjust'

export const latestMovementOnlyMessage =
  'Only the latest movement for this item can be deleted.'

export type ApplyInventoryOperationParams = {
  requestId?: string
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
  searchTerm?: string
  operationType: 'add' | 'issue' | 'both'
  page: number
  pageSize: number
}

export type InventoryReportRow = {
  tableName: string
  itemId: string
  itemName: string
  categoryName: string
  projectName: string
  totalAddedQuantity: number
  totalIssuedQuantity: number
  codeNumber: string | null
  weight: number | string | null
  length: number | string | null
  width: number | string | null
  th: number | string | null
}

export type InventoryReport = {
  rows: InventoryReportRow[]
  totalItems: number
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

function getDeleteOperationErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase()

  if (
    normalizedMessage.includes('only the latest movement') ||
    normalizedMessage.includes('latest movement only') ||
    normalizedMessage.includes('operation is not the latest')
  ) {
    return latestMovementOnlyMessage
  }

  return message || 'تعذر حذف حركة المخزون'
}

export async function deleteInventoryOperation(
  operationId: string | number,
  deletedBy: string,
) {
  if (!navigator.onLine) {
    throw new Error('يجب الاتصال بالإنترنت لحذف حركة المخزون.')
  }

  const client = getClientOrThrow()
  const { data, error } = await client.rpc(
    'delete_inventory_operation_rpc',
    {
      p_operation_id: operationId,
      p_deleted_by: deletedBy || 'user',
    },
  )

  if (error) {
    throw new Error(getDeleteOperationErrorMessage(error.message))
  }

  if (
    !data ||
    typeof data !== 'object' ||
    !('status' in data) ||
    data.status !== 'success'
  ) {
    throw new Error('تعذر حذف حركة المخزون')
  }

  return data
}

export async function applyInventoryOperation(
  params: ApplyInventoryOperationParams,
) {
  const quantity = Number(params.quantity)
  const requestId = params.requestId ?? crypto.randomUUID()

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
      p_request_id: requestId,
    },
  )

  if (error) {
    throw new Error(getOperationErrorMessage(error.message))
  }

  if (!data || typeof data !== 'object' || !('status' in data) || !['success', 'already_processed'].includes(String(data.status))) {
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
  filters: InventoryReportFilters,
): Promise<InventoryReport> {
  const client = getClientOrThrow()
  const { data, error } = await client.rpc(
    'get_aggregated_inventory_report_rpc',
    {
      p_from_date: filters.fromDate || null,
      p_to_date: filters.toDate || null,
      p_category_name: filters.categoryName || null,
      p_project_name: filters.projectName || null,
      p_search: filters.searchTerm?.trim() || null,
      p_operation_type: filters.operationType === 'both' ? null : filters.operationType,
      p_page: filters.page,
      p_page_size: filters.pageSize,
    },
  )

  if (error) {
    throw new Error(error.message || 'تعذر تحميل بيانات التقارير')
  }

  const payload = data && typeof data === 'object'
    ? data as Record<string, unknown>
    : {}
  const summaryRecord = payload.summary && typeof payload.summary === 'object'
    ? payload.summary as OperationRecord
    : {}
  const rows = Array.isArray(payload.rows)
    ? payload.rows.map((value): InventoryReportRow => {
        const row = value as OperationRecord
        return {
          tableName: toText(row.table_name),
          itemId: toText(row.item_id),
          itemName: toText(row.item_name) || '—',
          categoryName: toText(row.category_name) || '—',
          projectName: toText(row.project_name) || '—',
          totalAddedQuantity: toNumber(row.total_added_quantity),
          totalIssuedQuantity: toNumber(row.total_issued_quantity),
          codeNumber: toText(row.code_number) || null,
          weight: row.weight as number | string | null | undefined ?? null,
          length: row.length as number | string | null | undefined ?? null,
          width: row.width as number | string | null | undefined ?? null,
          th: row.th as number | string | null | undefined ?? null,
        }
      })
    : []

  return {
    rows,
    totalItems: toNumber(payload.total_items),
    summary: {
      additionOperationsCount: toNumber(summaryRecord.addition_operations_count),
      totalAddedQuantity: toNumber(summaryRecord.total_added_quantity),
      issueOperationsCount: toNumber(summaryRecord.issue_operations_count),
      totalIssuedQuantity: toNumber(summaryRecord.total_issued_quantity),
    },
  }
}

export async function getCompleteInventoryReport(
  filters: InventoryReportFilters,
): Promise<InventoryReport> {
  const pageSize = 100
  const firstPage = await getInventoryReport({
    ...filters,
    page: 1,
    pageSize,
  })
  const totalPages = Math.ceil(firstPage.totalItems / pageSize)

  if (totalPages <= 1) {
    return firstPage
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      getInventoryReport({
        ...filters,
        page: index + 2,
        pageSize,
      }),
    ),
  )

  return {
    ...firstPage,
    rows: [
      ...firstPage.rows,
      ...remainingPages.flatMap((page) => page.rows),
    ],
  }
}
