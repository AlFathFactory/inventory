import * as XLSX from 'xlsx'
import { buildImportKey } from './identity'
import { deduplicateItems, deduplicateMovements } from './identity'
import { displayExcelText, parseExcelNumber } from './normalization'
import { getCustomSheetConfig } from './sheetConfig'
import {
  parseBearingCountSheet,
  parseCuttingDiscsSheet,
  parseCylinderSheet,
  parseWeldingGlovesSheet,
} from './specialSheetParsers'
import { parseNormalStockSheet } from './stockParser'
import type {
  CustomCuttingDisc,
  CustomExcelPreview,
  CustomInventoryItem,
  CustomInventoryMovement,
  CustomSheetDiagnosis,
  CustomWeldingGlove,
  SheetParseResult,
  StockTableName,
} from './types'

type LegacyRow = Record<string, unknown> & { __rowNumber: number }

const STOCK_TABLES = new Set<StockTableName>([
  'consumables',
  'paints',
  'screws',
  'stock_screws',
  'raw_materials',
  'cylinders',
])

function readLegacySheet(workbook: XLSX.WorkBook, sheetName: string): LegacyRow[] {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
    dateNF: 'yyyy-mm-dd',
  }).map((row, index) => ({ ...row, __rowNumber: index + 2 }))
}

function legacyText(row: LegacyRow, key: string) {
  return displayExcelText(row[key])
}

function parseLegacyTemplate(workbook: XLSX.WorkBook, fileName: string): CustomExcelPreview {
  const errors: string[] = []
  const warnings: string[] = []
  const itemRows = readLegacySheet(workbook, 'Items')
  const movementRows = readLegacySheet(workbook, 'Movements')

  const items = itemRows.flatMap<CustomInventoryItem>((row) => {
    const tableName = legacyText(row, 'table_name') as StockTableName
    const itemKey = legacyText(row, 'item_key')
    const itemName = legacyText(row, 'item_name')
    if (!STOCK_TABLES.has(tableName) || !itemKey || !itemName) {
      errors.push(`Items - row ${row.__rowNumber}: table_name, item_key and item_name are required.`)
      return []
    }
    return [{
      table_name: tableName,
      item_key: itemKey,
      project_name: legacyText(row, 'project_name') || legacyText(row, 'project'),
      item_name: itemName,
      type_name: legacyText(row, 'type_name') || undefined,
      opening_balance: parseExcelNumber(row.opening_balance) ?? 0,
      total_added: parseExcelNumber(row.total_added) ?? 0,
      total_issued: parseExcelNumber(row.total_issued) ?? 0,
      stock_balance: parseExcelNumber(row.stock_balance) ?? 0,
      min_quantity: parseExcelNumber(row.min_quantity) ?? undefined,
      transaction_date: legacyText(row, 'transaction_date') || '2026-07-31',
      source: { file_name: fileName, sheet: 'Items', row: row.__rowNumber },
      fields: {
        din: legacyText(row, 'din') || undefined,
        code_number: legacyText(row, 'code_number') || undefined,
        weight: parseExcelNumber(row.weight),
        length: parseExcelNumber(row.length),
        width: parseExcelNumber(row.width),
        th: parseExcelNumber(row.th),
        material_source: legacyText(row, 'material_source') || undefined,
      },
      notes: legacyText(row, 'notes') || undefined,
    }]
  })

  const movements = movementRows.flatMap<CustomInventoryMovement>((row) => {
    const tableName = legacyText(row, 'table_name') as StockTableName
    const itemKey = legacyText(row, 'item_key')
    const operationType = legacyText(row, 'operation_type').toLowerCase()
    const quantity = parseExcelNumber(row.quantity)
    if (
      !STOCK_TABLES.has(tableName) ||
      !itemKey ||
      !['add', 'issue', 'adjust'].includes(operationType) ||
      quantity === null
    ) {
      errors.push(`Movements - row ${row.__rowNumber}: invalid movement payload.`)
      return []
    }
    const movementWithoutKey: Omit<CustomInventoryMovement, 'import_key'> = {
      table_name: tableName,
      item_key: itemKey,
      project_name: legacyText(row, 'project_name'),
      category_name: legacyText(row, 'category_name'),
      item_name: legacyText(row, 'item_name'),
      operation_type: operationType as CustomInventoryMovement['operation_type'],
      operation_date: legacyText(row, 'operation_date'),
      quantity,
      previous_balance: parseExcelNumber(row.previous_balance) ?? 0,
      new_balance: parseExcelNumber(row.new_balance) ?? 0,
      notes: legacyText(row, 'notes') || undefined,
      source: { file_name: fileName, sheet: 'Movements', row: row.__rowNumber },
    }
    return [{
      ...movementWithoutKey,
      import_key: legacyText(row, 'import_key') || buildImportKey(movementWithoutKey),
    }]
  })

  const cuttingDiscs = readLegacySheet(workbook, 'Cutting_Discs').map<CustomCuttingDisc>((row) => ({
    code: legacyText(row, 'code') || null,
    type_name: legacyText(row, 'type_name'),
    received_by: legacyText(row, 'received_by') || null,
    received_date: legacyText(row, 'received_date') || null,
    scrapped_date: legacyText(row, 'scrapped_date') || null,
    notes: legacyText(row, 'notes') || null,
    source_file: fileName,
    source_sheet: 'Cutting_Discs',
    source_row: row.__rowNumber,
  }))
  const longWeldingGloves = readLegacySheet(workbook, 'Long_Welding_Gloves').map<CustomWeldingGlove>((row) => ({
    type_name: legacyText(row, 'type_name'),
    received_by: legacyText(row, 'received_by'),
    received_date: legacyText(row, 'received_date') || null,
    quantity: parseExcelNumber(row.quantity) ?? 1,
    notes: legacyText(row, 'notes') || null,
    source_file: fileName,
    source_sheet: 'Long_Welding_Gloves',
    source_row: row.__rowNumber,
  }))

  return {
    kind: 'custom-excel',
    fileName,
    items,
    movements,
    cuttingDiscs,
    longWeldingGloves,
    errors,
    warnings,
    ignoredSheets: workbook.SheetNames.filter((name) => !['Items', 'Movements', 'Cutting_Discs', 'Long_Welding_Gloves'].includes(name)),
  }
}

function mergeResult(target: CustomExcelPreview, parsed: SheetParseResult) {
  target.items.push(...parsed.items)
  target.movements.push(...parsed.movements)
  target.cuttingDiscs.push(...parsed.cuttingDiscs)
  target.longWeldingGloves.push(...parsed.longWeldingGloves)
  target.errors.push(...parsed.errors)
  target.warnings.push(...parsed.warnings)
}

export function parseCustomInventoryWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
): CustomExcelPreview | null {
  if (workbook.SheetNames.includes('Items') && workbook.SheetNames.includes('Movements')) {
    return parseLegacyTemplate(workbook, fileName)
  }

  const supportedSheets = workbook.SheetNames
    .map((sheetName) => ({ sheetName, config: getCustomSheetConfig(sheetName) }))
    .filter((entry) => entry.config !== null)
  if (supportedSheets.length === 0) return null

  const preview: CustomExcelPreview = {
    kind: 'custom-excel',
    fileName,
    items: [],
    movements: [],
    cuttingDiscs: [],
    longWeldingGloves: [],
    errors: [],
    warnings: [],
    ignoredSheets: [],
    sheetDiagnoses: [],
  }

  for (const sheetName of workbook.SheetNames) {
    const config = getCustomSheetConfig(sheetName)
    if (!config) {
      preview.ignoredSheets.push(sheetName)
      preview.warnings.push(`تم تجاهل الشيت غير المدعوم "${sheetName}".`)
      continue
    }

    const sheet = workbook.Sheets[sheetName]
    const beforeItems = preview.items.length
    const beforeMovements = preview.movements.length
    let parsed: SheetParseResult
    switch (config.parser) {
      case 'stock':
        parsed = parseNormalStockSheet(sheet, sheetName, fileName, config)
        break
      case 'bearing-count':
        parsed = parseBearingCountSheet(sheet, sheetName, fileName)
        break
      case 'cylinders':
        parsed = parseCylinderSheet(sheet, sheetName, fileName, config)
        break
      case 'cutting-discs':
        parsed = parseCuttingDiscsSheet(sheet, sheetName, fileName)
        break
      case 'welding-gloves':
        parsed = parseWeldingGlovesSheet(sheet, sheetName, fileName)
        break
    }
    mergeResult(preview, parsed)
    const diagnosis: CustomSheetDiagnosis = {
      sheetName,
      detectedType: config.tableName ?? config.parser,
      itemCount: preview.items.length - beforeItems,
      movementCount: preview.movements.length - beforeMovements,
      skippedRows: parsed.skippedRows,
      warnings: parsed.warnings,
    }
    preview.sheetDiagnoses?.push(diagnosis)
  }

  const itemDeduplication = deduplicateItems(preview.items)
  preview.items = itemDeduplication.items
  preview.warnings.push(...itemDeduplication.warnings)
  preview.errors.push(...itemDeduplication.errors)
  const movementDeduplication = deduplicateMovements(preview.movements)
  preview.movements = movementDeduplication.movements
  preview.warnings.push(...movementDeduplication.warnings)

  if (
    preview.items.length === 0 &&
    preview.cuttingDiscs.length === 0 &&
    preview.longWeldingGloves.length === 0
  ) {
    preview.errors.push('لم يتم العثور على أي بيانات قابلة للاستيراد في الشيتات المدعومة.')
  }
  return preview
}

export async function parseCustomInventoryExcel(file: File): Promise<CustomExcelPreview | null> {
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      cellDates: true,
      cellNF: true,
    })
    return parseCustomInventoryWorkbook(workbook, file.name)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر فتح ملف Excel.'
    return {
      kind: 'custom-excel',
      fileName: file.name,
      items: [],
      movements: [],
      cuttingDiscs: [],
      longWeldingGloves: [],
      errors: [`تعذر فتح ملف Excel: ${message}`],
      warnings: [],
      ignoredSheets: [],
    }
  }
}
