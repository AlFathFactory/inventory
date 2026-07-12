import type { JsonValue } from '../services/inventoryService'

export type NormalizedImportItem = {
  item_key: string
  table_name: string
  item_name: string
  category_key?: string
  category_name?: string
  project_name?: string | null
  stock_balance?: number
  opening_balance?: number
  total_added?: number
  total_issued?: number
  min_quantity?: number
  fields?: Record<string, JsonValue>
}

export type NormalizedImportMovement = {
  item_key: string
  table_name: string
  operation_type: 'add' | 'issue'
  quantity: number
  operation_date: string | null
  previous_balance?: number
  new_balance?: number
  item_name?: string
  category_name?: string
  project_name?: string | null
  notes?: string | null
}

export type NormalizedInventoryImport = {
  schema_version: 'inventory_import_v1'
  items: NormalizedImportItem[]
  movements: NormalizedImportMovement[]
  cylinder_records: Record<string, JsonValue>[]
  custody_records: {
    cutting_discs: Record<string, JsonValue>[]
    long_welding_gloves: Record<string, JsonValue>[]
  }
  warnings: string[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`JSON field "${name}" must be an array.`)
  return value
}

export async function parseNormalizedInventoryJson(
  file: File,
): Promise<NormalizedInventoryImport> {
  let document: unknown
  try {
    document = JSON.parse(await file.text())
  } catch {
    throw new Error('The selected file is not valid JSON.')
  }

  if (!isObject(document) || document.schema_version !== 'inventory_import_v1') {
    throw new Error('Unsupported JSON schema_version. Expected "inventory_import_v1".')
  }

  const rawItems = requireArray(document.items, 'items')
  const rawMovements = requireArray(document.movements, 'movements')
  const items = rawItems.map((value, index) => {
    if (!isObject(value) || typeof value.item_key !== 'string' ||
        typeof value.table_name !== 'string' || typeof value.item_name !== 'string') {
      throw new Error(`Invalid item at items[${index}].`)
    }
    if (value.fields !== undefined && !isObject(value.fields)) {
      throw new Error(`items[${index}].fields must be an object.`)
    }
    return value as unknown as NormalizedImportItem
  })
  const movements = rawMovements.map((value, index) => {
    if (!isObject(value) || typeof value.item_key !== 'string' ||
        typeof value.table_name !== 'string' ||
        (value.operation_type !== 'add' && value.operation_type !== 'issue') ||
        typeof value.quantity !== 'number') {
      throw new Error(`Invalid movement at movements[${index}]. Only add and issue are supported.`)
    }
    return value as unknown as NormalizedImportMovement
  })
  const custody = isObject(document.custody_records) ? document.custody_records : {}

  return {
    schema_version: 'inventory_import_v1',
    items,
    movements,
    cylinder_records: (Array.isArray(document.cylinder_records) ? document.cylinder_records : []) as Record<string, JsonValue>[],
    custody_records: {
      cutting_discs: (Array.isArray(custody.cutting_discs) ? custody.cutting_discs : []) as Record<string, JsonValue>[],
      long_welding_gloves: (Array.isArray(custody.long_welding_gloves) ? custody.long_welding_gloves : []) as Record<string, JsonValue>[],
    },
    warnings: (Array.isArray(document.warnings) ? document.warnings : []).map(String),
  }
}
