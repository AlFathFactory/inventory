import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'
import { getCategoryByTable } from '../config/categoryConfig'
import type { ParsedInventoryRow, ParsedRowsByTable } from '../utils/excelParser'
import type { NormalizedInventoryImport, NormalizedImportItem } from '../utils/jsonImportParser'
import { getExpiryAlertStatus } from '../utils/expiryStatus'
import { generateInventoryInternalCode } from './inventoryCodeService'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type InventoryRow = Record<string, JsonValue>

const supportedStockTables = new Set([
  'consumables',
  'paints',
  'screws',
  'stock_screws',
  'raw_materials',
  'cylinders',
])

const alertQueryPageSize = 1000

export type ServiceSuccess<TData> = {
  data: TData
  error: null
}

export type ServiceFailure = {
  data: null
  error: string
}

export type ServiceResult<TData> = Promise<ServiceSuccess<TData> | ServiceFailure>

export type InventoryImportResult = {
  importedRowCount: number
  processedItemCount: number
  insertedItemsCount: number
  updatedItemsCount: number
  insertedMovementsCount: number
  skippedItemsCount?: number
  updatedMovementsCount?: number
  skippedMovementsCount?: number
  insertedCustodyCount?: number
  updatedCustodyCount?: number
  skippedCustodyCount?: number
  completedChunks?: number
  failedStage?: string | null
  failedChunk?: number | null
  completed?: boolean
  errors: string[]
}

function createSuccess<TData>(data: TData): ServiceSuccess<TData> {
  return {
    data,
    error: null,
  }
}

function createFailure(message: string): ServiceFailure {
  return {
    data: null,
    error: message,
  }
}

function getClientOrFailure(): ServiceFailure | null {
  if (!isSupabaseConfigured || !supabaseClient) {
    return createFailure(getSupabaseConfigError())
  }

  return null
}

async function getAllTableRows<TRow extends InventoryRow>(
  tableName: string,
): ServiceResult<TRow[]> {
  const rows: TRow[] = []

  while (true) {
    const from = rows.length
    const { data, error } = await supabaseClient!
      .from(tableName)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + alertQueryPageSize - 1)

    if (error) {
      return createFailure(error.message)
    }

    const page = (data ?? []) as TRow[]
    if (page.length === 0) {
      return createSuccess(rows)
    }

    rows.push(...page)
  }
}

function normalizeError(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}

function toText(value: JsonValue | undefined): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return ''
}

function toNumberValue(value: JsonValue | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalizedValue = Number(value)
    return Number.isFinite(normalizedValue) ? normalizedValue : null
  }

  return null
}

function toNonNegativeNumber(value: JsonValue | undefined): number {
  const parsedValue = toNumberValue(value)
  return parsedValue !== null && parsedValue > 0 ? parsedValue : 0
}

function normalizeItemKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function buildItemKey(
  tableName: string,
  row: Record<string, JsonValue | undefined>,
) {
  const category = getCategoryByTable(tableName)
  const itemNameField = String(category?.itemNameField ?? 'item_name')
  const identityParts = [
    normalizeItemKeyPart(tableName),
    normalizeItemKeyPart(toText(row.project)),
    normalizeItemKeyPart(toText(row[itemNameField])),
  ]

  if (tableName === 'screws' || tableName === 'stock_screws') {
    identityParts.push(
      normalizeItemKeyPart(toText(row.din)),
      normalizeItemKeyPart(toText(row.code_number)),
    )
  }

  if (tableName === 'raw_materials') {
    identityParts.push(
      normalizeItemKeyPart(toText(row.weight)),
      normalizeItemKeyPart(toText(row.length)),
      normalizeItemKeyPart(toText(row.width)),
      normalizeItemKeyPart(toText(row.th)),
      normalizeItemKeyPart(toText(row.material_source)),
    )
  }

  if (tableName === 'cutting_discs') {
    identityParts.push(normalizeItemKeyPart(toText(row.code)))
  }

  if (tableName === 'long_welding_gloves') {
    identityParts.push(
      normalizeItemKeyPart(toText(row.received_by)),
      normalizeItemKeyPart(toText(row.received_date)),
    )
  }

  return identityParts.join('::')
}

function getRowDateValue(row: ParsedInventoryRow): string {
  const transactionDate = toText(row.transaction_date)
  return transactionDate || ''
}

function sortRowsByDateAsc(left: ParsedInventoryRow, right: ParsedInventoryRow) {
  const leftDate = getRowDateValue(left)
  const rightDate = getRowDateValue(right)

  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate)
  }

  const leftOrder = toNumberValue(left.__import_order as JsonValue | undefined) ?? 0
  const rightOrder = toNumberValue(right.__import_order as JsonValue | undefined) ?? 0

  return leftOrder - rightOrder
}

function setIfPresent(
  target: Record<string, JsonValue>,
  key: string,
  value: JsonValue | undefined,
) {
  if (value !== null && value !== undefined && value !== '') {
    target[key] = value
  }
}

function buildItemPayload(
  tableName: string,
  rows: readonly ParsedInventoryRow[],
): Record<string, JsonValue> {
  const category = getCategoryByTable(tableName)

  if (!category) {
    throw new Error(`Unknown category table "${tableName}".`)
  }

  const latestRow = [...rows].sort(sortRowsByDateAsc).at(-1)

  if (!latestRow) {
    throw new Error(`No import rows found for table "${tableName}".`)
  }

  const itemNameField = String(category.itemNameField ?? 'item_name')
  const itemName = toText(latestRow[itemNameField])
  const projectName = toText(latestRow.project)

  if (!itemName) {
    throw new Error(`Missing item name for table "${tableName}".`)
  }

  const latestStockBalance = toNumberValue(latestRow.stock_balance)
  const latestGasBalance = toNumberValue(latestRow.gas_balance)
  const latestTotalAdded = toNumberValue(latestRow.total_added)
  const latestTotalIssued = toNumberValue(latestRow.total_issued)
  const fallbackTotalAdded = rows.reduce(
    (sum, row) => sum + toNonNegativeNumber(row.added),
    0,
  )
  const fallbackTotalIssued = rows.reduce(
    (sum, row) => sum + toNonNegativeNumber(row.issued),
    0,
  )

  const payload: Record<string, JsonValue> = {
    item_key: buildItemKey(tableName, latestRow),
  }

  Object.keys(category.columns).forEach((columnKey) => {
    setIfPresent(payload, columnKey, latestRow[columnKey])
  })

  if (tableName === 'paints') {
    payload.expire_date = toText(latestRow.expire_date) || null
  }

  payload[itemNameField] = itemName

  if ('project' in category.columns || projectName) {
    payload.project = projectName
  }

  if (latestStockBalance !== null) {
    payload.stock_balance = latestStockBalance
  }

  if (latestGasBalance !== null) {
    payload.gas_balance = latestGasBalance
  }

  payload.total_added = latestTotalAdded ?? fallbackTotalAdded
  payload.total_issued = latestTotalIssued ?? fallbackTotalIssued

  return payload
}

async function upsertImportedItem(
  tableName: string,
  rows: readonly ParsedInventoryRow[],
) {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    throw new Error(clientFailure.error)
  }

  const itemPayload = buildItemPayload(tableName, rows)
  const itemKey = toText(itemPayload.item_key)

  const { data: existingItem, error: fetchError } = await supabaseClient!
    .from(tableName)
    .select('*')
    .eq('item_key', itemKey)
    .limit(1)
    .maybeSingle()

  if (fetchError) {
    throw new Error(fetchError.message)
  }

  if (!existingItem) {
    const { data: insertedItem, error: insertError } = await supabaseClient!
      .from(tableName)
      .insert(itemPayload as never)
      .select('*')
      .single()

    if (insertError || !insertedItem) {
      throw new Error(insertError?.message || `Failed to insert item into "${tableName}".`)
    }

    return { item: insertedItem as InventoryRow, wasCreated: true }
  }

  const { data: updatedItem, error: updateError } = await supabaseClient!
    .from(tableName)
    .update(itemPayload as never)
    .eq('id', existingItem.id)
    .select('*')
    .single()

  if (updateError || !updatedItem) {
    throw new Error(updateError?.message || `Failed to update item in "${tableName}".`)
  }

  return { item: updatedItem as InventoryRow, wasCreated: false }
}

async function insertImportedMovements(
  tableName: string,
  rows: readonly ParsedInventoryRow[],
  itemRecord: InventoryRow,
) {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    throw new Error(clientFailure.error)
  }

  const category = getCategoryByTable(tableName)

  if (!category) {
    throw new Error(`Unknown category table "${tableName}".`)
  }

  const itemNameField = String(category.itemNameField ?? 'item_name')
  const itemName = toText(itemRecord[itemNameField] ?? rows[0]?.[itemNameField])
  const projectName = toText(itemRecord.project ?? rows[0]?.project)
  const operations: Record<string, JsonValue>[] = []
  const sortedRows = [...rows].sort(sortRowsByDateAsc)
  const firstRow = sortedRows[0]

  let runningBalance =
    toNumberValue(firstRow?.stock_balance) !== null
      ? (toNumberValue(firstRow?.stock_balance) ?? 0) -
        toNonNegativeNumber(firstRow?.added) +
        toNonNegativeNumber(firstRow?.issued)
      : 0

  sortedRows.forEach((row) => {
    const addedQuantity = toNonNegativeNumber(row.added)
    const issuedQuantity = toNonNegativeNumber(row.issued)
    const rowBalance = toNumberValue(row.stock_balance)
    const operationDate = toText(row.transaction_date)

    if (rowBalance !== null) {
      runningBalance = rowBalance - addedQuantity + issuedQuantity
    }

    if (addedQuantity > 0) {
      const previousBalance = runningBalance
      const newBalance = previousBalance + addedQuantity

      operations.push({
        table_name: tableName,
        category_name: category.label,
        category_label: category.label,
        item_id: itemRecord.id ?? null,
        item_name: itemName,
        item_label: itemName,
        project_name: projectName,
        project: projectName,
        operation_type: 'add',
        quantity: addedQuantity,
        operation_date: operationDate || null,
        previous_balance: previousBalance,
        new_balance: newBalance,
      })

      runningBalance = newBalance
    }

    if (issuedQuantity > 0) {
      const previousBalance = runningBalance
      const newBalance = previousBalance - issuedQuantity

      operations.push({
        table_name: tableName,
        category_name: category.label,
        category_label: category.label,
        item_id: itemRecord.id ?? null,
        item_name: itemName,
        item_label: itemName,
        project_name: projectName,
        project: projectName,
        operation_type: 'issue',
        quantity: issuedQuantity,
        operation_date: operationDate || null,
        previous_balance: previousBalance,
        new_balance: newBalance,
      })

      runningBalance = newBalance
    }
  })

  if (operations.length === 0) {
    return 0
  }

  const { error: insertError } = await supabaseClient!
    .from('inventory_operations')
    .insert(operations as never)

  if (insertError) {
    throw new Error(insertError.message)
  }

  return operations.length
}

function buildNormalizedItemPayload(item: NormalizedImportItem): Record<string, JsonValue> {
  const category = getCategoryByTable(item.table_name)
  if (!category) throw new Error(`Unknown category table "${item.table_name}".`)

  const itemNameField = String(category.itemNameField ?? 'item_name')
  return {
    ...(item.fields ?? {}),
    item_key: item.item_key.trim(),
    [itemNameField]: item.item_name,
    ...(item.project_name !== undefined ? { project: item.project_name } : {}),
    ...(item.stock_balance !== undefined ? { stock_balance: item.stock_balance } : {}),
    ...(item.opening_balance !== undefined ? { opening_balance: item.opening_balance } : {}),
    ...(item.total_added !== undefined ? { total_added: item.total_added } : {}),
    ...(item.total_issued !== undefined ? { total_issued: item.total_issued } : {}),
    ...(item.min_quantity !== undefined ? { min_quantity: item.min_quantity } : {}),
  }
}

/** Imports the stable inventory_import_v1 contract without any Excel assumptions. */
export async function importNormalizedInventoryJson(
  document: NormalizedInventoryImport,
): ServiceResult<InventoryImportResult> {
  const clientFailure = getClientOrFailure()
  if (clientFailure) return clientFailure

  let insertedItemsCount = 0
  let updatedItemsCount = 0
  let insertedMovementsCount = 0
  const errors: string[] = []
  const resolvedItems = new Map<string, { tableName: string; row: InventoryRow }>()

  const recordItems: NormalizedImportItem[] = [
    ...document.cylinder_records.map((record) => ({ ...record, table_name: 'cylinders' }) as unknown as NormalizedImportItem),
    ...document.custody_records.cutting_discs.map((record) => ({ ...record, table_name: 'cutting_discs' }) as unknown as NormalizedImportItem),
    ...document.custody_records.long_welding_gloves.map((record) => ({ ...record, table_name: 'long_welding_gloves' }) as unknown as NormalizedImportItem),
  ].filter((item) => Boolean(item.item_key && item.item_name))

  // Last occurrence wins, while the table + item_key pair guarantees one upsert.
  const uniqueItems = new Map<string, NormalizedImportItem>()
  for (const item of [...document.items, ...recordItems]) {
    uniqueItems.set(`${item.table_name}::${item.item_key}`, item)
  }

  for (const item of uniqueItems.values()) {
    try {
      const payload = buildNormalizedItemPayload(item)
      const { data: existing, error: fetchError } = await supabaseClient!
        .from(item.table_name).select('*').eq('item_key', item.item_key).limit(1).maybeSingle()
      if (fetchError) throw new Error(fetchError.message)

      const query = existing
        ? supabaseClient!.from(item.table_name).update(payload as never).eq('id', existing.id)
        : supabaseClient!.from(item.table_name).insert(payload as never)
      const { data: saved, error: saveError } = await query.select('*').single()
      if (saveError || !saved) throw new Error(saveError?.message || 'Failed to save item.')

      resolvedItems.set(`${item.table_name}::${item.item_key}`, { tableName: item.table_name, row: saved as InventoryRow })
      existing ? updatedItemsCount++ : insertedItemsCount++
    } catch (error) {
      errors.push(`${item.table_name}/${item.item_key}: ${normalizeError(error, 'Failed to import item.')}`)
    }
  }

  for (const movement of document.movements) {
    try {
      const category = getCategoryByTable(movement.table_name)
      if (!category) throw new Error(`Unknown category table "${movement.table_name}".`)
      let resolved = resolvedItems.get(`${movement.table_name}::${movement.item_key}`)
      if (!resolved) {
        const { data, error } = await supabaseClient!.from(movement.table_name)
          .select('*').eq('item_key', movement.item_key).limit(1).maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) throw new Error('Item not found by item_key.')
        resolved = { tableName: movement.table_name, row: data as InventoryRow }
      }
      const itemNameField = String(category.itemNameField ?? 'item_name')
      const { error } = await supabaseClient!.from('inventory_operations').insert({
        table_name: movement.table_name,
        category_name: movement.category_name ?? category.label,
        category_label: movement.category_name ?? category.label,
        item_id: resolved.row.id ?? null,
        item_name: movement.item_name ?? resolved.row[itemNameField] ?? '',
        item_label: movement.item_name ?? resolved.row[itemNameField] ?? '',
        project_name: movement.project_name ?? resolved.row.project ?? '',
        project: movement.project_name ?? resolved.row.project ?? '',
        operation_type: movement.operation_type,
        quantity: movement.quantity,
        operation_date: movement.operation_date,
        previous_balance: movement.previous_balance ?? null,
        new_balance: movement.new_balance ?? null,
        notes: movement.notes ?? null,
      } as never)
      if (error) throw new Error(error.message)
      insertedMovementsCount++
    } catch (error) {
      errors.push(`movement ${movement.table_name}/${movement.item_key}: ${normalizeError(error, 'Failed to import movement.')}`)
    }
  }

  return createSuccess({
    importedRowCount: uniqueItems.size + document.movements.length,
    processedItemCount: uniqueItems.size,
    insertedItemsCount,
    updatedItemsCount,
    insertedMovementsCount,
    errors,
  })
}

export async function importInventoryRowsFromExcel(
  rowsByTable: ParsedRowsByTable,
): ServiceResult<InventoryImportResult> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    let importedRowCount = 0
    let processedItemCount = 0
    let insertedItemsCount = 0
    let updatedItemsCount = 0
    let insertedMovementsCount = 0
    const errors: string[] = []

    for (const [tableName, rawRows] of Object.entries(rowsByTable)) {
      const category = getCategoryByTable(tableName)

      if (!category || rawRows.length === 0) {
        continue
      }

      const itemNameField = String(category.itemNameField ?? 'item_name')
      const groupedRows = new Map<string, ParsedInventoryRow[]>()

      rawRows.forEach((row, index) => {
        const itemName = toText(row[itemNameField])

        if (!itemName) {
          return
        }

        const itemKey = buildItemKey(tableName, row)
        const rowWithOrder = {
          ...row,
          __import_order: index,
        } satisfies ParsedInventoryRow

        const existingRows = groupedRows.get(itemKey) ?? []
        existingRows.push(rowWithOrder)
        groupedRows.set(itemKey, existingRows)
      })

      for (const groupedItemRows of groupedRows.values()) {
        try {
          const upsertResult = await upsertImportedItem(tableName, groupedItemRows)
          const movementCount = await insertImportedMovements(
            tableName,
            groupedItemRows,
            upsertResult.item,
          )
          processedItemCount += 1
          importedRowCount += groupedItemRows.length
          insertedMovementsCount += movementCount
          if (upsertResult.wasCreated) {
            insertedItemsCount += 1
          } else {
            updatedItemsCount += 1
          }
        } catch (error) {
          errors.push(
            `${tableName}: ${normalizeError(error, 'Failed to import an item.')}`,
          )
        }
      }
    }

    return createSuccess({
      importedRowCount,
      processedItemCount,
      insertedItemsCount,
      updatedItemsCount,
      insertedMovementsCount,
      errors,
    })
  } catch (error) {
    return createFailure(
      normalizeError(error, 'Failed to import inventory rows from Excel.'),
    )
  }
}

function getNextDateValue(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  const nextDate = new Date(year, month - 1, day + 1)
  const nextYear = nextDate.getFullYear()
  const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0')
  const nextDay = String(nextDate.getDate()).padStart(2, '0')

  return `${nextYear}-${nextMonth}-${nextDay}`
}

function escapeSearchTerm(searchTerm: string): string {
  return searchTerm.replaceAll('%', '\\%').replaceAll(',', '\\,')
}

function toComparableNumber(value: JsonValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalizedValue = Number(value)
    return Number.isFinite(normalizedValue) ? normalizedValue : null
  }

  return null
}

export async function getCategoryRows<TRow extends InventoryRow = InventoryRow>(
  tableName: string,
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const { data, error } = await supabaseClient!.from(tableName).select('*')

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess((data ?? []) as TRow[])
  } catch (error) {
    return createFailure(
      normalizeError(error, `Failed to fetch rows from table "${tableName}".`),
    )
  }
}

export async function getCategoryRowsByDateRange<
  TRow extends InventoryRow = InventoryRow,
>(
  tableName: string,
  dateField: keyof TRow & string,
  fromDate: string,
  toDate: string,
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const exclusiveToDate = getNextDateValue(toDate)
    const { data, error } = await supabaseClient!
      .from(tableName)
      .select('*')
      .gte(dateField, fromDate)
      .lt(dateField, exclusiveToDate)
      .order(dateField, { ascending: true })

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess((data ?? []) as TRow[])
  } catch (error) {
    return createFailure(
      normalizeError(
        error,
        `Failed to fetch rows by date range from table "${tableName}".`,
      ),
    )
  }
}

export async function searchCategoryRows<
  TRow extends InventoryRow = InventoryRow,
>(
  tableName: string,
  searchFields: readonly (keyof TRow & string)[],
  searchTerm: string,
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  if (searchFields.length === 0) {
    return createFailure('At least one search field is required.')
  }

  const trimmedSearchTerm = searchTerm.trim()

  if (!trimmedSearchTerm) {
    return getCategoryRows<TRow>(tableName)
  }

  const escapedSearchTerm = escapeSearchTerm(trimmedSearchTerm)
  const orFilter = searchFields
    .map((field) => `${field}.ilike.%${escapedSearchTerm}%`)
    .join(',')

  try {
    const { data, error } = await supabaseClient!
      .from(tableName)
      .select('*')
      .or(orFilter)

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess((data ?? []) as TRow[])
  } catch (error) {
    return createFailure(
      normalizeError(
        error,
        `Failed to search rows in table "${tableName}".`,
      ),
    )
  }
}

export async function insertRows<
  TRow extends InventoryRow = InventoryRow,
  TInsertRow extends Partial<TRow> = Partial<TRow>,
>(
  tableName: string,
  rows: readonly TInsertRow[],
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  if (rows.length === 0) {
    return createSuccess([])
  }

  try {
    const { data, error } = await supabaseClient!
      .from(tableName)
      .insert([...rows] as never)
      .select('*')

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess((data ?? []) as TRow[])
  } catch (error) {
    return createFailure(
      normalizeError(error, `Failed to insert rows into table "${tableName}".`),
    )
  }
}

export async function createInventoryItem(
  tableName: string,
  values: Record<string, JsonValue | undefined>,
): ServiceResult<InventoryRow> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  const category = getCategoryByTable(tableName)

  if (!category) {
    return createFailure(`Unknown category table "${tableName}".`)
  }

  if (!supportedStockTables.has(tableName)) {
    return createFailure(`Unsupported inventory table "${tableName}".`)
  }

  try {
    const itemNameField = String(category.itemNameField ?? 'item_name')
    const itemName = toText(values[itemNameField])

    if (!itemName) {
      return createFailure('اسم الصنف مطلوب')
    }

    const payload: Record<string, JsonValue> = {
      item_key: buildItemKey(tableName, values),
      supplier_name: toText(values.supplier_name) || null,
    }

    Object.keys(category.columns).forEach((columnKey) => {
      setIfPresent(payload, columnKey, values[columnKey])
    })

    if (tableName === 'paints') {
      payload.expire_date = toText(values.expire_date) || null
    }

    if (tableName === 'screws' || tableName === 'stock_screws') {
      payload.din = toText(values.din) || null
      payload.code_number = toText(values.code_number) || null
    }

    if (tableName === 'raw_materials') {
      payload.code_number = toText(values.code_number) || null
      payload.project = toText(values.project) || null
      payload.material_source = toText(values.material_source) || null
    }

    payload[itemNameField] = itemName

    const projectName = toText(values.project)
    if ('project' in category.columns || projectName) {
      payload.project = projectName
    }

    if (category.stockField) {
      const stockField = String(category.stockField)
      const initialQuantity = toNumberValue(values[stockField]) ?? 0
      payload[stockField] = initialQuantity

      if (tableName !== 'cylinders') {
        payload.added = initialQuantity
        payload.total_added = initialQuantity
        payload.total_issued = 0
      }
    }

    if (category.minQuantityField) {
      const minQuantityField = String(category.minQuantityField)
      payload[minQuantityField] = toNumberValue(values[minQuantityField]) ?? 0
    }

    if (tableName === 'cylinders') {
      const gasBalance = toNumberValue(values.gas_balance) ?? 0
      Object.assign(payload, {
        project: projectName || null,
        type_name: itemName,
        gas_balance: gasBalance,
        stock_balance: gasBalance,
        empty_count: toNumberValue(values.empty_count) ?? 0,
        full_count: toNumberValue(values.full_count) ?? 0,
        min_quantity: toNumberValue(values.min_quantity) ?? 0,
        transaction_date: toText(values.transaction_date) || null,
        notes: toText(values.notes) || null,
      })
    }

    const { data, error } = await supabaseClient!
      .from(tableName)
      .insert(payload as never)
      .select('*')
      .single()

    if (error || !data) {
      if (error?.code === '23505') {
        return createFailure('هذا الصنف موجود بالفعل في هذا القسم')
      }
      return createFailure(error?.message || 'تعذر إضافة الصنف')
    }

    const createdItem = data as InventoryRow
    const createdItemId = createdItem.id

    if (typeof createdItemId !== 'string' && typeof createdItemId !== 'number') {
      return createFailure('تعذر تحديد الصنف الجديد لإنشاء كود الصنف')
    }

    const internalCode = await generateInventoryInternalCode(tableName, createdItemId)

    return createSuccess({
      ...createdItem,
      internal_code: internalCode,
    })
  } catch (error) {
    return createFailure(normalizeError(error, `Failed to create item in "${tableName}".`))
  }
}

export async function getLowStockRows<
  TRow extends InventoryRow = InventoryRow,
>(
  tableName: string,
  stockField: keyof TRow & string,
  minQuantityField: keyof TRow & string,
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const result = await getAllTableRows<TRow>(tableName)

    if (result.data === null) {
      return result
    }

    const rows = result.data.filter((row) => {
      const stockValue = toComparableNumber(row[stockField])
      const minQuantityValue = toComparableNumber(row[minQuantityField])

      if (stockValue === null || minQuantityValue === null) {
        return false
      }

      return stockValue <= minQuantityValue
    })

    return createSuccess(rows)
  } catch (error) {
    return createFailure(
      normalizeError(
        error,
        `Failed to fetch low stock rows from table "${tableName}".`,
      ),
    )
  }
}

export async function getOutOfStockRows<
  TRow extends InventoryRow = InventoryRow,
>(
  tableName: string,
  stockField: keyof TRow & string,
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const result = await getAllTableRows<TRow>(tableName)

    if (result.data === null) {
      return result
    }

    const rows = result.data.filter((row) => {
      const stockValue = toComparableNumber(row[stockField])

      if (stockValue === null) {
        return false
      }

      return stockValue <= 0
    })

    return createSuccess(rows)
  } catch (error) {
    return createFailure(
      normalizeError(
        error,
        `Failed to fetch out-of-stock rows from table "${tableName}".`,
      ),
    )
  }
}

export async function getExpiryAlertRows<
  TRow extends InventoryRow = InventoryRow,
>(
  tableName: string,
  expireDateField: keyof TRow & string,
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const result = await getAllTableRows<TRow>(tableName)

    if (result.data === null) {
      return result
    }

    const rows = result.data.filter((row) => {
      const expireDate = row[expireDateField]
      return (
        typeof expireDate === 'string' &&
        getExpiryAlertStatus(expireDate) !== null
      )
    })

    return createSuccess(rows)
  } catch (error) {
    return createFailure(
      normalizeError(
        error,
        `Failed to fetch expiry alerts from table "${tableName}".`,
      ),
    )
  }
}
