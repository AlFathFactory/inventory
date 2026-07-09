import * as XLSX from 'xlsx'
import {
  categoryConfig,
  type CategoryConfigEntry,
  type CategoryKey,
} from '../config/categoryConfig'

type ParsedCellValue = string | number | boolean | null

export type ParsedInventoryRow = Record<string, ParsedCellValue> & {
  source_file: string
  source_sheet: string
}

export type ParsedRowsByTable = Record<string, ParsedInventoryRow[]>

export type ExcelImportPreview = {
  fileName: string
  matchedSheets: Array<{
    sheetName: string
    categoryKey: CategoryKey
    table: string
    rowCount: number
  }>
  ignoredSheets: string[]
  totalRows: number
  rowsByTable: ParsedRowsByTable
  errors: string[]
}

type RawSheetRow = unknown[]

const arabicDigitMap: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
}

const categoryEntries = Object.entries(categoryConfig) as Array<
  [CategoryKey, CategoryConfigEntry]
>

function normalizeArabicDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => arabicDigitMap[digit] ?? digit)
}

function normalizeText(value: string): string {
  return normalizeArabicDigits(value)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function isDateField(
  supabaseColumnKey: string,
  category: CategoryConfigEntry,
): boolean {
  if (supabaseColumnKey === category.dateField) {
    return true
  }

  return supabaseColumnKey.endsWith('_date')
}

function isRowEmpty(row: Record<string, ParsedCellValue>): boolean {
  return Object.values(row).every((value) => {
    if (value === null) {
      return true
    }

    if (typeof value === 'string') {
      return value.trim() === ''
    }

    return false
  })
}

function formatDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseExcelSerialDate(value: number): string | null {
  const parsedDate = XLSX.SSF.parse_date_code(value)

  if (!parsedDate) {
    return null
  }

  const date = new Date(
    parsedDate.y,
    Math.max(parsedDate.m - 1, 0),
    parsedDate.d,
  )

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return formatDateValue(date)
}

function tryConvertToNumber(value: string): number | null {
  const normalizedValue = normalizeArabicDigits(value)
    .replace(/[٬,]/g, '')
    .replace(/٫/g, '.')
    .trim()

  if (!normalizedValue) {
    return null
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalizedValue)) {
    return null
  }

  const parsedNumber = Number(normalizedValue)

  return Number.isFinite(parsedNumber) ? parsedNumber : null
}

function tryConvertToDate(value: string): string | null {
  const normalizedValue = normalizeArabicDigits(value).trim()

  if (!normalizedValue) {
    return null
  }

  const normalizedSeparators = normalizedValue.replace(/[.\u2212]/g, '/')
  const parsedDate = new Date(normalizedSeparators)

  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return formatDateValue(parsedDate)
}

function convertCellValue(
  value: unknown,
  supabaseColumnKey: string,
  category: CategoryConfigEntry,
): ParsedCellValue {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (value instanceof Date) {
    return formatDateValue(value)
  }

  if (typeof value === 'number') {
    if (isDateField(supabaseColumnKey, category)) {
      return parseExcelSerialDate(value) ?? value
    }

    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalizedString = normalizeArabicDigits(value).trim()

    if (!normalizedString) {
      return null
    }

    if (isDateField(supabaseColumnKey, category)) {
      const parsedDate = tryConvertToDate(normalizedString)
      if (parsedDate) {
        return parsedDate
      }
    }

    const parsedNumber = tryConvertToNumber(normalizedString)
    if (parsedNumber !== null) {
      return parsedNumber
    }

    return normalizedString
  }

  return String(value)
}

function getCategoryBySheetName(sheetName: string) {
  const normalizedSheetName = normalizeText(sheetName)

  return categoryEntries.find(([, category]) => {
    return normalizeText(category.label) === normalizedSheetName
  })
}

function getColumnKeyByArabicHeader(
  headerLabel: string,
  category: CategoryConfigEntry,
): string | null {
  const normalizedHeader = normalizeText(headerLabel)

  const matchedEntry = Object.entries(category.columns).find(([, label]) => {
    return normalizeText(label) === normalizedHeader
  })

  return matchedEntry?.[0] ?? null
}

function buildRowsForSheet(
  sheetRows: RawSheetRow[],
  category: CategoryConfigEntry,
  fileName: string,
  sheetName: string,
  errors: string[],
): ParsedInventoryRow[] {
  if (sheetRows.length === 0) {
    return []
  }

  const [headerRow, ...dataRows] = sheetRows

  if (!Array.isArray(headerRow) || headerRow.length === 0) {
    errors.push(`Sheet "${sheetName}" is missing a header row.`)
    return []
  }

  const headerMappings = headerRow.map((headerCell, columnIndex) => {
    const headerLabel = String(headerCell ?? '').trim()

    if (!headerLabel) {
      return null
    }

    const columnKey = getColumnKeyByArabicHeader(headerLabel, category)

    if (!columnKey) {
      errors.push(
        `Sheet "${sheetName}" has an unmapped column "${headerLabel}" at position ${columnIndex + 1}.`,
      )
      return null
    }

    return {
      columnIndex,
      columnKey,
    }
  })

  return dataRows.reduce<ParsedInventoryRow[]>((rows, currentRow) => {
    if (!Array.isArray(currentRow)) {
      return rows
    }

    const parsedRow: Record<string, ParsedCellValue> = {}

    headerMappings.forEach((mapping) => {
      if (!mapping) {
        return
      }

      const cellValue = currentRow[mapping.columnIndex]
      parsedRow[mapping.columnKey] = convertCellValue(
        cellValue,
        mapping.columnKey,
        category,
      )
    })

    if (isRowEmpty(parsedRow)) {
      return rows
    }

    rows.push({
      ...parsedRow,
      source_file: fileName,
      source_sheet: sheetName,
    })

    return rows
  }, [])
}

export async function parseInventoryExcel(
  file: File,
): Promise<ExcelImportPreview> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
  })

  const rowsByTable: ParsedRowsByTable = {}
  const matchedSheets: ExcelImportPreview['matchedSheets'] = []
  const ignoredSheets: string[] = []
  const errors: string[] = []
  let totalRows = 0

  workbook.SheetNames.forEach((sheetName) => {
    const matchedCategoryEntry = getCategoryBySheetName(sheetName)

    if (!matchedCategoryEntry) {
      ignoredSheets.push(sheetName)
      return
    }

    const [categoryKey, category] = matchedCategoryEntry
    const worksheet = workbook.Sheets[sheetName]

    if (!worksheet) {
      errors.push(`Sheet "${sheetName}" could not be read from the workbook.`)
      return
    }

    const sheetRows = XLSX.utils.sheet_to_json<RawSheetRow>(worksheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    })

    const parsedRows = buildRowsForSheet(
      sheetRows,
      category,
      file.name,
      sheetName,
      errors,
    )

    rowsByTable[category.table] = parsedRows
    totalRows += parsedRows.length

    matchedSheets.push({
      sheetName,
      categoryKey,
      table: category.table,
      rowCount: parsedRows.length,
    })
  })

  return {
    fileName: file.name,
    matchedSheets,
    ignoredSheets,
    totalRows,
    rowsByTable,
    errors,
  }
}
