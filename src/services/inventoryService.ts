import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'
import { getCategoryByTable } from '../config/categoryConfig'
import type { ParsedInventoryRow, ParsedRowsByTable } from '../utils/excelParser'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type InventoryRow = Record<string, JsonValue>

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

  if (tableName === 'cones4_materials') {
    identityParts.push(normalizeItemKeyPart(toText(row.weight)))
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

  try {
    const itemNameField = String(category.itemNameField ?? 'item_name')
    const itemName = toText(values[itemNameField])

    if (!itemName) {
      return createFailure('اسم الصنف مطلوب')
    }

    const payload: Record<string, JsonValue> = {
      item_key: buildItemKey(tableName, values),
    }

    Object.keys(category.columns).forEach((columnKey) => {
      setIfPresent(payload, columnKey, values[columnKey])
    })

    payload[itemNameField] = itemName

    const projectName = toText(values.project)
    if ('project' in category.columns || projectName) {
      payload.project = projectName
    }

    if (category.stockField) {
      const stockField = String(category.stockField)
      payload[stockField] = toNumberValue(values[stockField]) ?? 0
    }

    if (category.minQuantityField) {
      const minQuantityField = String(category.minQuantityField)
      payload[minQuantityField] = toNumberValue(values[minQuantityField]) ?? 0
    }

    if (!('total_added' in payload)) {
      payload.total_added = 0
    }

    if (!('total_issued' in payload)) {
      payload.total_issued = 0
    }

    const itemKey = toText(payload.item_key)
    const { data: existingItem, error: existingItemError } = await supabaseClient!
      .from(tableName)
      .select('id')
      .eq('item_key', itemKey)
      .limit(1)
      .maybeSingle()

    if (existingItemError) {
      return createFailure(existingItemError.message)
    }

    if (existingItem) {
      return createFailure('هذا الصنف موجود بالفعل في هذا القسم')
    }

    const { data, error } = await supabaseClient!
      .from(tableName)
      .insert(payload as never)
      .select('*')
      .single()

    if (error || !data) {
      return createFailure(error?.message || 'تعذر إضافة الصنف')
    }

    return createSuccess(data as InventoryRow)
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
    const { data, error } = await supabaseClient!.from(tableName).select('*')

    if (error) {
      return createFailure(error.message)
    }

    const rows = ((data ?? []) as TRow[]).filter((row) => {
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
    const { data, error } = await supabaseClient!.from(tableName).select('*')

    if (error) {
      return createFailure(error.message)
    }

    const rows = ((data ?? []) as TRow[]).filter((row) => {
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
