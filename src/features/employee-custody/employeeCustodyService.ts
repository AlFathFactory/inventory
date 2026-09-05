import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../../lib/supabaseClient'
import type {
  AddEmployeeCustodyInput,
  CustodyInventoryItem,
  CustodyIssueCandidate,
  EmployeeCustodyRecord,
  ScrapEmployeeCustodyInput,
} from './types'

type UnknownRecord = Record<string, unknown>

const manualCustodyTables = [
  'consumables',
  'paints',
  'screws',
  'stock_screws',
  'raw_materials',
  'cylinders',
  'inventory_items',
] as const

const categoryLabels: Record<(typeof manualCustodyTables)[number], string> = {
  consumables: 'مستهلكات',
  paints: 'الدهانات',
  screws: 'مسامير',
  stock_screws: 'مسامير استوك',
  raw_materials: 'خامات',
  cylinders: 'اسطوانات',
  inventory_items: 'تصنيف ديناميكي',
}

function client() {
  if (!isSupabaseConfigured || !supabaseClient) {
    throw new Error(getSupabaseConfigError())
  }
  return supabaseClient
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function textValue(...values: unknown[]) {
  const value = values.find((candidate) =>
    (typeof candidate === 'string' && candidate.trim() !== '') ||
    typeof candidate === 'number',
  )
  return value == null ? '' : String(value)
}

function nullableText(...values: unknown[]) {
  return textValue(...values) || null
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function unwrapRows(value: unknown, possibleKeys: string[]): UnknownRecord[] {
  if (Array.isArray(value)) return value.map(asRecord)
  const record = asRecord(value)
  for (const key of possibleKeys) {
    const nested = record[key]
    if (Array.isArray(nested)) return nested.map(asRecord)
  }
  return Object.keys(record).length > 0 ? [record] : []
}

function normalizeCustodyRecord(row: UnknownRecord): EmployeeCustodyRecord {
  const nestedItem = asRecord(row.item ?? row.item_details ?? row.inventory_item)
  const item = { ...nestedItem, ...row }
  const tableName = textValue(row.table_name, row.tableName)
  return {
    id: textValue(row.id, row.custody_id),
    employeeId: textValue(row.employee_id, row.employeeId),
    tableName,
    itemId: textValue(row.item_id, row.itemId),
    sourceIssueOperationId: nullableText(
      row.source_issue_operation_id,
      row.sourceIssueOperationId,
    ),
    quantity: numberValue(row.quantity, 1),
    receivedDate: textValue(row.received_date, row.receivedDate),
    scrappedDate: nullableText(row.scrapped_date, row.scrappedDate),
    scrapReason: nullableText(row.scrap_reason, row.scrapReason),
    notes: nullableText(row.notes),
    itemName: textValue(
      item.item_name,
      item.type_name,
      item.item_label,
      item.name,
      'صنف غير مسمى',
    ),
    itemCode: nullableText(
      item.internal_code,
      item.item_code,
      item.code_number,
      item.code,
    ),
    categoryName: nullableText(
      item.category_name,
      item.category_label,
      item.source_sheet,
      categoryLabels[tableName as keyof typeof categoryLabels],
    ),
    projectName: nullableText(item.project_name, item.project),
    itemDetails: item,
  }
}

function normalizeIssueCandidate(row: UnknownRecord): CustodyIssueCandidate {
  return {
    operationId: textValue(row.operation_id, row.id),
    tableName: textValue(row.table_name),
    itemId: textValue(row.item_id),
    itemName: textValue(row.item_name, row.item_label, 'صنف غير مسمى'),
    itemCode: nullableText(row.internal_code, row.item_code, row.code_number),
    categoryName: nullableText(row.category_name, row.category_label),
    projectName: nullableText(row.project_name, row.project),
    projectId: nullableText(row.project_id),
    quantity: numberValue(row.quantity, 0),
    operationDate: textValue(row.operation_date, row.issue_date),
    createdAt: nullableText(row.created_at),
    returnedQuantity: numberValue(row.returned_quantity, 0),
    returnStatus: nullableText(row.return_status),
  }
}

export function getCustodyErrorMessage(
  error: unknown,
  fallback = 'تعذر تنفيذ عملية العهدة. حاول مرة أخرى.',
) {
  const databaseError = asRecord(error)
  const message = [databaseError.message, databaseError.details, databaseError.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (message.includes('already scrapped') || message.includes('تم تكهين')) {
    return 'تم تكهين العهدة بالفعل'
  }
  if (
    message.includes('duplicate') ||
    message.includes('already exists') ||
    message.includes('already registered') ||
    message.includes('مسجلة بالفعل')
  ) {
    return 'العهدة مسجلة بالفعل'
  }
  if (message.includes('employee') && (message.includes('not found') || message.includes('does not exist'))) {
    return 'الموظف غير موجود'
  }
  if (message.includes('item') && (message.includes('not found') || message.includes('does not exist'))) {
    return 'الصنف غير موجود'
  }
  if (
    message.includes('issue') &&
    (message.includes('invalid') || message.includes('employee') || message.includes('mismatch'))
  ) {
    return 'حركة الصرف غير صالحة لهذا الموظف'
  }
  if (
    message.includes('scrapped_date') ||
    message.includes('scrapped date') ||
    message.includes('before received')
  ) {
    return 'تاريخ التكهين غير صالح'
  }
  if (message.includes('received_date') || message.includes('received date')) {
    return 'تاريخ الاستلام مطلوب'
  }
  if (message.includes('reason') && (message.includes('required') || message.includes('empty'))) {
    return 'سبب التكهين مطلوب'
  }
  return fallback
}

function throwCustodyError(error: unknown, fallback: string): never {
  throw new Error(getCustodyErrorMessage(error, fallback))
}

export async function getEmployeeCustodyItems(employeeId: string) {
  const { data, error } = await client().rpc('get_employee_custody_items_rpc', {
    p_employee_id: employeeId,
  })
  if (error) throwCustodyError(error, 'تعذر تحميل عهدة الموظف')
  return unwrapRows(data, ['items', 'custody_items', 'data']).map(normalizeCustodyRecord)
}

export async function getEmployeeCustodyIssueCandidates(employeeId: string) {
  const { data, error } = await client().rpc('get_employee_custody_issue_candidates_rpc', {
    p_employee_id: employeeId,
  })
  if (error) throwCustodyError(error, 'تعذر تحميل الأصناف المصروفة للموظف')
  return unwrapRows(data, ['items', 'candidates', 'data']).map(normalizeIssueCandidate)
}

export async function addEmployeeCustodyItem(input: AddEmployeeCustodyInput) {
  const { data, error } = await client().rpc('add_employee_custody_item_rpc', {
    p_employee_id: input.employeeId,
    p_table_name: input.tableName,
    p_item_id: input.itemId,
    p_received_date: input.receivedDate,
    p_source_issue_operation_id: input.sourceIssueOperationId,
    p_quantity: input.quantity,
    p_notes: input.notes?.trim() || null,
    p_created_by: input.createdBy?.trim() || 'user',
  })
  if (error) throwCustodyError(error, 'تعذر تسجيل العهدة')
  return data
}

export async function addEmployeeCustodyItems(
  items: AddEmployeeCustodyInput[],
  addOne: (input: AddEmployeeCustodyInput) => Promise<unknown> = addEmployeeCustodyItem,
) {
  const results = await Promise.allSettled(items.map((item) => addOne(item)))
  const failures = results.flatMap((result, index) => result.status === 'rejected'
    ? [{
        index,
        message: result.reason instanceof Error
          ? result.reason.message
          : 'تعذر تسجيل العهدة',
      }]
    : [])
  return { savedCount: items.length - failures.length, failures }
}

export async function scrapEmployeeCustodyItem(input: ScrapEmployeeCustodyInput) {
  const { data, error } = await client().rpc('mark_employee_custody_scrapped_rpc', {
    p_custody_id: input.custodyId,
    p_scrapped_date: input.scrappedDate,
    p_reason: input.reason.trim(),
    p_scrapped_by: input.scrappedBy?.trim() || 'user',
  })
  if (error) throwCustodyError(error, 'تعذر تكهين العهدة')
  return data
}

function normalizeInventoryItem(tableName: string, row: UnknownRecord): CustodyInventoryItem {
  const typedTable = tableName as keyof typeof categoryLabels
  return {
    tableName,
    itemId: textValue(row.id),
    itemName: textValue(row.item_name, row.type_name, 'صنف غير مسمى'),
    internalCode: nullableText(row.internal_code, row.item_code, row.code_number, row.code),
    categoryName: textValue(row.category_name, row.source_sheet, categoryLabels[typedTable]),
    projectName: nullableText(row.project_name, row.project),
    currentStock: row.stock_balance == null && row.gas_balance == null
      ? null
      : numberValue(row.stock_balance ?? row.gas_balance),
    details: row,
  }
}

async function getManualTableItems(tableName: (typeof manualCustodyTables)[number]) {
  const rows: UnknownRecord[] = []
  const pageSize = 1000
  while (true) {
    const from = rows.length
    const { data, error } = await client()
      .from(tableName)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throwCustodyError(error, `تعذر تحميل أصناف ${categoryLabels[tableName]}`)
    const page = (data ?? []).map(asRecord)
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
    .filter((row) => row.is_archived !== true)
    .map((row) => normalizeInventoryItem(tableName, row))
}

export async function getManualCustodyInventoryItems() {
  const groups = await Promise.all(manualCustodyTables.map(getManualTableItems))
  return groups.flat()
}

export const employeeCustodyKeys = {
  all: ['employee-custody'] as const,
  employee: (employeeId: string) => ['employee-custody', employeeId] as const,
  issueCandidates: (employeeId: string) =>
    ['employee-custody-candidates', employeeId] as const,
  inventoryCatalog: ['employee-custody-inventory-catalog'] as const,
}
