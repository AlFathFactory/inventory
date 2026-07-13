import * as XLSX from 'xlsx'
import { getCategoryByTable } from '../config/categoryConfig'

export type CustomExcelValue = string | number | null
export type CustomExcelRow = Record<string, CustomExcelValue> & { __rowNumber: number }

export type CustomExcelPreview = {
  kind: 'custom-excel'
  fileName: string
  items: CustomExcelRow[]
  movements: CustomExcelRow[]
  cuttingDiscs: CustomExcelRow[]
  longWeldingGloves: CustomExcelRow[]
  errors: string[]
}

const REQUIRED_SHEETS = ['Items', 'Movements'] as const

function text(value: CustomExcelValue | undefined) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function readSheet(workbook: XLSX.WorkBook, sheetName: string): CustomExcelRow[] {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []

  return XLSX.utils.sheet_to_json<Record<string, CustomExcelValue>>(sheet, {
    defval: null,
    raw: false,
    dateNF: 'yyyy-mm-dd',
  }).map((row, index) => ({ ...row, __rowNumber: index + 2 }))
}

function validateRequired(
  rows: CustomExcelRow[],
  sheet: string,
  fields: readonly string[],
  errors: string[],
) {
  for (const row of rows) {
    for (const field of fields) {
      if (!text(row[field])) errors.push(`${sheet} - row ${row.__rowNumber}: ${field} is required.`)
    }
  }
}

export async function parseCustomInventoryExcel(file: File): Promise<CustomExcelPreview | null> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  if (!REQUIRED_SHEETS.every((name) => workbook.SheetNames.includes(name))) return null

  const items = readSheet(workbook, 'Items')
  const movements = readSheet(workbook, 'Movements')
  const cuttingDiscs = readSheet(workbook, 'Cutting_Discs')
  const longWeldingGloves = readSheet(workbook, 'Long_Welding_Gloves')
  const errors: string[] = []

  validateRequired(items, 'Items', ['table_name', 'item_key', 'item_name'], errors)
  validateRequired(movements, 'Movements', ['table_name', 'item_key', 'operation_type', 'operation_date'], errors)

  for (const [sheet, rows] of [['Items', items], ['Movements', movements]] as const) {
    for (const row of rows) {
      const tableName = text(row.table_name)
      if (tableName && !getCategoryByTable(tableName)) {
        errors.push(`${sheet} - row ${row.__rowNumber}: unknown table_name "${tableName}".`)
      } else if (sheet === 'Items' && (tableName === 'cutting_discs' || tableName === 'long_welding_gloves')) {
        errors.push(`${sheet} - row ${row.__rowNumber}: use the dedicated custody sheet for table "${tableName}".`)
      }
    }
  }

  const seenKeys = new Map<string, number>()
  for (const row of items) {
    const key = text(row.item_key)
    if (!key) continue
    const previousRow = seenKeys.get(key)
    if (previousRow) errors.push(`Items - row ${row.__rowNumber}: duplicate item_key "${key}" (first found at row ${previousRow}).`)
    else seenKeys.set(key, row.__rowNumber)
  }

  for (const row of movements) {
    const operationType = text(row.operation_type).toLowerCase()
    if (operationType && operationType !== 'add' && operationType !== 'issue') {
      errors.push(`Movements - row ${row.__rowNumber}: operation_type must be add or issue.`)
    }
    const quantity = Number(row.quantity)
    if (row.quantity === null || text(row.quantity) === '' || !Number.isFinite(quantity)) {
      errors.push(`Movements - row ${row.__rowNumber}: quantity must be numeric.`)
    }
  }

  for (const row of longWeldingGloves) {
    if (row.quantity !== null && text(row.quantity) !== '' && !Number.isFinite(Number(row.quantity))) {
      errors.push(`Long_Welding_Gloves - row ${row.__rowNumber}: quantity must be numeric.`)
    }
  }

  return { kind: 'custom-excel', fileName: file.name, items, movements, cuttingDiscs, longWeldingGloves, errors }
}
