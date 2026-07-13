import { getCategoryByTable } from '../config/categoryConfig'
import { getSupabaseConfigError, isSupabaseConfigured, supabaseClient } from '../lib/supabaseClient'
import type { CustomExcelPreview, CustomExcelRow, CustomExcelValue } from '../utils/customExcelParser'
import type { InventoryImportResult, ServiceResult } from './inventoryService'

const ITEM_CHUNK_SIZE = 200
const MOVEMENT_CHUNK_SIZE = 300
const CUSTODY_CHUNK_SIZE = 200

function chunks<T>(rows: readonly T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size))
  return result
}

function groupByTable(rows: CustomExcelRow[]) {
  const grouped = new Map<string, CustomExcelRow[]>()
  for (const row of rows) {
    const tableName = text(row.table_name)
    grouped.set(tableName, [...(grouped.get(tableName) ?? []), row])
  }
  return grouped
}

function text(value: CustomExcelValue | undefined) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function optionalText(value: CustomExcelValue | undefined) {
  const valueText = text(value)
  return valueText || null
}

function optionalNumber(value: CustomExcelValue | undefined) {
  if (value === null || value === undefined || text(value) === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function itemPayload(row: CustomExcelRow) {
  const tableName = text(row.table_name)
  const category = getCategoryByTable(tableName)
  if (!category) throw new Error(`Unknown table_name "${tableName}".`)
  if (tableName === 'cutting_discs' || tableName === 'long_welding_gloves') {
    throw new Error(`Use the dedicated custody sheet for table "${tableName}".`)
  }

  const itemNameField = String(category.itemNameField ?? 'item_name')
  const payload: Record<string, string | number | null> = {
    item_key: text(row.item_key),
    [itemNameField]: text(row.item_name),
  }
  const textFields = ['transaction_date', 'notes']
  const numericFields = ['opening_balance', 'total_added', 'total_issued', 'min_quantity']
  if (tableName !== 'cylinders') numericFields.push('stock_balance')
  if (text(row.project_name)) payload.project = text(row.project_name)
  for (const field of textFields) if (text(row[field])) payload[field] = text(row[field])
  for (const field of numericFields) {
    const value = optionalNumber(row[field])
    if (value !== null) payload[field] = value
  }

  if (tableName === 'raw_materials') {
    for (const field of ['weight', 'length', 'width', 'th']) {
      const value = optionalNumber(row[field])
      if (value !== null) payload[field] = value
    }
    for (const field of ['dimension_text', 'material_source']) {
      if (text(row[field])) payload[field] = text(row[field])
    }
  }
  if (tableName === 'paints') payload.expire_date = optionalText(row.expire_date)
  if (tableName === 'screws' || tableName === 'stock_screws') {
    payload.din = optionalText(row.din)
    payload.code_number = optionalText(row.code_number)
  }
  if (tableName === 'cylinders') {
    payload.gas_balance = optionalNumber(row.gas_balance) ?? 0
    for (const field of ['empty_count', 'full_count']) {
      const value = optionalNumber(row[field])
      if (value !== null) payload[field] = value
    }
  }
  return payload
}

async function importCustody(table: string, rows: CustomExcelRow[], fields: string[]) {
  for (const chunk of chunks(rows, CUSTODY_CHUNK_SIZE)) {
    const payloads = chunk.map((row) => Object.fromEntries(fields.map((field) => [field,
      field === 'quantity' ? optionalNumber(row[field]) : optionalText(row[field]),
    ])))
    const { error } = await supabaseClient!.from(table).insert(payloads as never)
    if (error) throw new Error(error.message)
  }
}

export async function importCustomInventoryExcel(preview: CustomExcelPreview): ServiceResult<InventoryImportResult> {
  if (!isSupabaseConfigured || !supabaseClient) return { data: null, error: getSupabaseConfigError() }
  if (preview.errors.length) return { data: null, error: preview.errors.join(' | ') }

  let insertedItemsCount = 0
  let updatedItemsCount = 0
  let insertedMovementsCount = 0
  const errors: string[] = []
  const itemsByTable = groupByTable(preview.items)

  try {
    for (const [tableName, rows] of itemsByTable) {
      const existingKeys = new Set<string>()
      for (const keyChunk of chunks(rows.map((row) => text(row.item_key)), ITEM_CHUNK_SIZE)) {
        const { data, error } = await supabaseClient.from(tableName).select('item_key').in('item_key', keyChunk)
        if (error) throw new Error(error.message)
        for (const row of data ?? []) existingKeys.add(String(row.item_key))
      }
      for (const rowChunk of chunks(rows, ITEM_CHUNK_SIZE)) {
        let payloads: ReturnType<typeof itemPayload>[]
        try { payloads = rowChunk.map(itemPayload) }
        catch (error) {
          const firstRow = rowChunk[0]?.__rowNumber ?? '?'
          throw new Error(`Items - row ${firstRow}: ${error instanceof Error ? error.message : 'Invalid item.'}`)
        }
        const { error } = await supabaseClient.from(tableName)
          .upsert(payloads as never, { onConflict: 'item_key' })
        if (error) throw new Error(`Items - table ${tableName}, rows ${rowChunk[0].__rowNumber}-${rowChunk.at(-1)!.__rowNumber}: ${error.message}`)
      }
      updatedItemsCount += rows.filter((row) => existingKeys.has(text(row.item_key))).length
      insertedItemsCount += rows.length - rows.filter((row) => existingKeys.has(text(row.item_key))).length
    }

    const resolvedItems = new Map<string, Record<string, unknown>>()
    const movementsByTable = groupByTable(preview.movements)
    for (const [tableName, movements] of movementsByTable) {
      const category = getCategoryByTable(tableName)
      if (!category) throw new Error(`Movements - row ${movements[0].__rowNumber}: unknown table_name "${tableName}".`)
      const keys = [...new Set(movements.map((row) => text(row.item_key)))]
      for (const keyChunk of chunks(keys, MOVEMENT_CHUNK_SIZE)) {
        const { data, error } = await supabaseClient.from(tableName).select('*').in('item_key', keyChunk)
        if (error) throw new Error(error.message)
        for (const item of data ?? []) resolvedItems.set(`${tableName}::${item.item_key}`, item)
      }
      for (const movement of movements) {
        if (!resolvedItems.has(`${tableName}::${text(movement.item_key)}`)) {
          errors.push(`Movements - row ${movement.__rowNumber}: item_key "${text(movement.item_key)}" was not found in table "${tableName}".`)
        }
      }
      const validMovements = movements.filter((row) => resolvedItems.has(`${tableName}::${text(row.item_key)}`))
      const itemNameField = String(category.itemNameField ?? 'item_name')
      for (const movementChunk of chunks(validMovements, MOVEMENT_CHUNK_SIZE)) {
        const payloads = movementChunk.map((row) => {
          const item = resolvedItems.get(`${tableName}::${text(row.item_key)}`)!
          const itemName = text(row.item_name) || String(item[itemNameField] ?? '')
          const projectName = text(row.project_name) || String(item.project ?? '')
          return {
            table_name: tableName, category_name: text(row.category_name) || category.label,
            category_label: text(row.category_name) || category.label, item_id: item.id ?? null,
            item_name: itemName, item_label: itemName, project_name: projectName, project: projectName,
            operation_type: text(row.operation_type).toLowerCase(), quantity: Number(row.quantity),
            operation_date: text(row.operation_date), previous_balance: optionalNumber(row.previous_balance),
            new_balance: optionalNumber(row.new_balance), notes: optionalText(row.notes),
          }
        })
        const { error } = await supabaseClient.from('inventory_operations').insert(payloads as never)
        if (error) throw new Error(`Movements - rows ${movementChunk[0].__rowNumber}-${movementChunk.at(-1)!.__rowNumber}: ${error.message}`)
        insertedMovementsCount += payloads.length
      }
    }

    await importCustody('cutting_discs', preview.cuttingDiscs, ['code', 'type_name', 'received_by', 'received_date', 'scrapped_date'])
    await importCustody('long_welding_gloves', preview.longWeldingGloves, ['type_name', 'received_by', 'received_date', 'quantity'])

    for (const view of ['inventory_category_items_summary_view', 'inventory_item_movements_view']) {
      const { error } = await supabaseClient.from(view).select('*').limit(1)
      if (error) errors.push(`${view}: ${error.message}`)
    }

    return { data: {
      importedRowCount: preview.items.length + preview.movements.length + preview.cuttingDiscs.length + preview.longWeldingGloves.length,
      processedItemCount: preview.items.length, insertedItemsCount, updatedItemsCount, insertedMovementsCount, errors,
    }, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Failed to import the custom Excel workbook.' }
  }
}
