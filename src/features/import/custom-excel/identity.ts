import { normalizeKeyPart } from './normalization'
import type {
  CustomInventoryFields,
  CustomInventoryItem,
  CustomInventoryMovement,
  StockTableName,
} from './types'

function optionalKeyPart(value: unknown): string {
  return value === null || value === undefined ? '' : normalizeKeyPart(value)
}

export function buildItemKey(input: {
  tableName: StockTableName
  projectName: string
  itemName: string
  typeName?: string
  fields?: CustomInventoryFields
}): string {
  const { tableName, projectName, itemName, typeName, fields = {} } = input
  const base = [tableName, normalizeKeyPart(projectName)]

  if (tableName === 'cylinders') {
    return [...base, normalizeKeyPart(typeName || itemName)].join('::')
  }

  base.push(normalizeKeyPart(itemName))
  if (tableName === 'screws' || tableName === 'stock_screws') {
    return [...base, optionalKeyPart(fields.din), optionalKeyPart(fields.code_number)].join('::')
  }
  if (tableName === 'raw_materials') {
    return [
      ...base,
      optionalKeyPart(fields.code_number),
      optionalKeyPart(fields.material_source),
      optionalKeyPart(fields.length),
      optionalKeyPart(fields.width),
      optionalKeyPart(fields.th),
      optionalKeyPart(fields.weight),
      optionalKeyPart(fields.dimension_text),
    ].join('::')
  }
  return base.join('::')
}

export function buildImportKey(input: Omit<CustomInventoryMovement, 'import_key'>): string {
  const source = input.source
  return [
    source.file_name,
    source.sheet,
    source.row,
    input.item_key,
    input.operation_type,
    input.operation_date,
    input.quantity,
    input.previous_balance,
    input.new_balance,
  ].map(optionalKeyPart).join('|')
}

function itemState(item: CustomInventoryItem): string {
  return JSON.stringify({
    project_name: item.project_name,
    item_name: item.item_name,
    opening_balance: item.opening_balance,
    total_added: item.total_added,
    total_issued: item.total_issued,
    stock_balance: item.stock_balance,
    fields: item.fields,
  })
}

export function deduplicateItems(items: readonly CustomInventoryItem[]): {
  items: CustomInventoryItem[]
  warnings: string[]
  errors: string[]
} {
  const result: CustomInventoryItem[] = []
  const byKey = new Map<string, CustomInventoryItem>()
  const warnings: string[] = []
  const errors: string[] = []

  for (const item of items) {
    const existing = byKey.get(item.item_key)
    if (!existing) {
      byKey.set(item.item_key, item)
      result.push(item)
      continue
    }

    if (itemState(existing) === itemState(item)) {
      warnings.push(
        `تم تجاهل صف مكرر للصنف "${item.item_name}" في الشيت "${item.source.sheet}" (صف ${item.source.row}).`,
      )
    } else if (existing.table_name === 'raw_materials' && existing.source.sheet === item.source.sheet) {
      existing.opening_balance += item.opening_balance
      existing.total_added += item.total_added
      existing.total_issued += item.total_issued
      existing.stock_balance += item.stock_balance
      existing.source = item.source
      warnings.push(
        `تم تجميع الصف ${item.source.row} مع صنف خامات مطابق له "${item.item_name}" في الشيت "${item.source.sheet}".`,
      )
    } else if (existing.source.sheet === item.source.sheet) {
      const resultIndex = result.indexOf(existing)
      if (resultIndex >= 0) result[resultIndex] = item
      byKey.set(item.item_key, item)
      warnings.push(
        `تكرر الصنف "${item.item_name}" في الشيت "${item.source.sheet}"؛ تم اعتماد آخر صف (${item.source.row}) باعتباره الأحدث.`,
      )
    } else {
      errors.push(
        `المفتاح الموحد "${item.item_key}" يشير إلى بيانات متعارضة في الصفين ${existing.source.row} و${item.source.row} من الشيت "${item.source.sheet}".`,
      )
    }
  }
  return { items: result, warnings, errors }
}

export function deduplicateMovements(movements: readonly CustomInventoryMovement[]): {
  movements: CustomInventoryMovement[]
  warnings: string[]
} {
  const seen = new Set<string>()
  const result: CustomInventoryMovement[] = []
  const warnings: string[] = []

  for (const movement of movements) {
    if (seen.has(movement.import_key)) {
      warnings.push(`تم تجاهل حركة مكررة بالمفتاح "${movement.import_key}".`)
      continue
    }
    seen.add(movement.import_key)
    result.push(movement)
  }
  return { movements: result, warnings }
}
