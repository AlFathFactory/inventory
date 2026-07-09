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

type HeaderMapping = {
  columnIndex: number
  columnKey: string
}

type MatrixOperationColumn = {
  columnIndex: number
  operation: 'issued' | 'added'
  transactionDate: string | null
}

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

const columnAliases: Record<string, string[]> = {
  project: ['مشروع', 'المشروع', 'الاسم'],
  item_name: ['صنف', 'الصنف', 'الاسم', 'name'],
  transaction_date: ['تاريخ', 'التاريخ', 'تاربخ', 'التاريخالاستلام'],
  issued: ['صرف'],
  added: ['اضافه', 'إضافة', 'المضاف', 'اضافة'],
  total_added: ['اجماليالمضاف', 'اجمالىالمضاف'],
  total_issued: ['اجماليالصرف', 'اجمالىصرف', 'اجماليصرف'],
  stock_balance: ['الكميةرصيدمخزني', 'رصيدمخزني', 'رصيدمخزنى', 'رصيد'],
  min_quantity: ['الحدالأدنى', 'الحدالادنى'],
  type_name: ['نوع', 'النوع', 'type'],
  weight: ['وزن', 'الوزن'],
  total_weight: ['إجماليوزن', 'اجماليوزن'],
  din: ['din'],
  code_number: ['codenumber', 'coodnumber'],
  code: ['code', 'م'],
  received_by: ['اسماللياخذالصاروخ', 'اسمصاحبالصاروخ', 'اسمشخصاللياستلم', 'الاسم'],
  received_date: ['تاريخالاستلام', 'التاريخ'],
  scrapped_date: ['تاريخالتكهين', 'تكهين'],
  gas_balance: ['رصيد'],
  empty_count: ['فارغ'],
  full_count: ['ملي', 'مليبوتجاز'],
  notes: ['ملاحظات'],
}

const sheetAliases: Record<CategoryKey, string[]> = {
  consumables: ['مستهلكات'],
  paints: ['الدهانات'],
  cones4_materials: ['خاماتكونز4', 'خاماتكونز 4'],
  screws: ['مسامير', 'مساميرrotterdam'],
  stock_screws: ['مساميراستوك', 'مساميراستوكrotterdam'],
  raw_materials: ['خامات', 'خاماتالفتح', 'amset3'],
  cutting_discs: ['صواريخ', 'صواربخ'],
  cylinders: ['اسطوانات', 'اسطواناتغازات'],
  long_welding_gloves: ['جوانتىلحامطويل', 'جاونتيحامطويل', 'جوانتيحامطويل'],
}

function normalizeArabicDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => arabicDigitMap[digit] ?? digit)
}

function normalizeText(value: string): string {
  return normalizeArabicDigits(value)
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim()
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

    if (typeof value === 'number') {
      return value === 0
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

  return categoryEntries.find(([key, category]) => {
    const normalizedLabel = normalizeText(category.label)
    const aliases = sheetAliases[key] ?? []

    if (normalizedSheetName === normalizedLabel) {
      return true
    }

    if (aliases.some((alias) => normalizedSheetName.includes(normalizeText(alias)))) {
      return true
    }

    return normalizedSheetName.includes(normalizedLabel)
  })
}

function getColumnKeyByArabicHeader(
  headerLabel: string,
  category: CategoryConfigEntry,
): string | null {
  const normalizedHeader = normalizeText(headerLabel)

  const matchedEntry = Object.entries(category.columns).find(([key, label]) => {
    if (normalizeText(label) === normalizedHeader) {
      return true
    }

    return (columnAliases[key] ?? []).some(
      (alias) => normalizeText(alias) === normalizedHeader,
    )
  })

  return matchedEntry?.[0] ?? null
}

function getComparableCellText(value: unknown): string {
  if (value instanceof Date) {
    return formatDateValue(value)
  }

  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
}

function isOperationLabel(value: unknown): value is 'صرف' | 'اضافه' | 'إضافة' {
  const normalizedValue = normalizeText(getComparableCellText(value))
  return normalizedValue === 'صرف' || normalizedValue === 'اضافه'
}

function isDateLikeValue(value: unknown): boolean {
  if (value instanceof Date) {
    return true
  }

  if (typeof value === 'number') {
    return value >= 1 && value <= 31
  }

  if (typeof value !== 'string') {
    return false
  }

  return tryConvertToDate(value) !== null || tryConvertToNumber(value) !== null
}

function getHeaderRows(sheetRows: RawSheetRow[]): {
  primaryHeaderRow: RawSheetRow
  secondaryHeaderRow: RawSheetRow | null
  dataRows: RawSheetRow[]
} {
  const firstRow = sheetRows[0] ?? []
  const secondRow = sheetRows[1] ?? []
  const operationCount = secondRow.filter((cell) => isOperationLabel(cell)).length

  if (operationCount >= 4) {
    return {
      primaryHeaderRow: firstRow,
      secondaryHeaderRow: secondRow,
      dataRows: sheetRows.slice(2),
    }
  }

  return {
    primaryHeaderRow: firstRow,
    secondaryHeaderRow: null,
    dataRows: sheetRows.slice(1),
  }
}

function resolveMatrixDateValue(
  value: unknown,
  monthAnchor: string | null,
): string | null {
  if (value instanceof Date) {
    return formatDateValue(value)
  }

  if (typeof value === 'string') {
    return tryConvertToDate(value)
  }

  if (typeof value === 'number') {
    if (value >= 1 && value <= 31 && monthAnchor) {
      const anchorDate = new Date(monthAnchor)
      if (!Number.isNaN(anchorDate.getTime())) {
        return formatDateValue(
          new Date(anchorDate.getFullYear(), anchorDate.getMonth(), value),
        )
      }
    }

    return parseExcelSerialDate(value)
  }

  return null
}

function buildFlatHeaderMappings(
  headerRow: RawSheetRow,
  category: CategoryConfigEntry,
  sheetName: string,
  errors: string[],
): HeaderMapping[] {
  return headerRow.reduce<HeaderMapping[]>((mappings, headerCell, columnIndex) => {
    const headerLabel = getComparableCellText(headerCell).trim()

    if (!headerLabel) {
      return mappings
    }

    const columnKey = getColumnKeyByArabicHeader(headerLabel, category)

    if (!columnKey) {
      errors.push(
        `Sheet "${sheetName}" has an unmapped column "${headerLabel}" at position ${columnIndex + 1}.`,
      )
      return mappings
    }

    mappings.push({
      columnIndex,
      columnKey,
    })

    return mappings
  }, [])
}

function buildRowsFromFlatSheet(
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

  const headerMappings = buildFlatHeaderMappings(
    headerRow,
    category,
    sheetName,
    errors,
  )

  return dataRows.reduce<ParsedInventoryRow[]>((rows, currentRow) => {
    if (!Array.isArray(currentRow)) {
      return rows
    }

    const parsedRow: Record<string, ParsedCellValue> = {}

    headerMappings.forEach((mapping) => {
      parsedRow[mapping.columnKey] = convertCellValue(
        currentRow[mapping.columnIndex],
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

function buildMatrixStructure(
  primaryHeaderRow: RawSheetRow,
  secondaryHeaderRow: RawSheetRow,
  category: CategoryConfigEntry,
) {
  const operationStartIndex = secondaryHeaderRow.findIndex((cell) =>
    isOperationLabel(cell),
  )

  const operationColumns: MatrixOperationColumn[] = []
  const staticColumnMappings: HeaderMapping[] = []
  const summaryColumnMappings: HeaderMapping[] = []

  const monthAnchor =
    operationStartIndex > 0
      ? resolveMatrixDateValue(
          secondaryHeaderRow[operationStartIndex - 1],
          null,
        )
      : null

  let currentTransactionDate: string | null = null

  secondaryHeaderRow.forEach((secondaryCell, columnIndex) => {
    if (columnIndex < operationStartIndex) {
      const headerLabel = getComparableCellText(secondaryCell).trim()
      const columnKey = getColumnKeyByArabicHeader(headerLabel, category)

      if (columnKey) {
        staticColumnMappings.push({
          columnIndex,
          columnKey,
        })
      }

      return
    }

    const primaryCell = primaryHeaderRow[columnIndex]

    if (isDateLikeValue(primaryCell)) {
      currentTransactionDate = resolveMatrixDateValue(primaryCell, monthAnchor)
    }

    if (isOperationLabel(secondaryCell)) {
      operationColumns.push({
        columnIndex,
        operation: normalizeText(getComparableCellText(secondaryCell)) === 'صرف'
          ? 'issued'
          : 'added',
        transactionDate: currentTransactionDate,
      })
      return
    }

    const summaryHeader =
      getComparableCellText(primaryCell).trim() ||
      getComparableCellText(secondaryCell).trim()

    const summaryColumnKey = getColumnKeyByArabicHeader(summaryHeader, category)

    if (summaryColumnKey) {
      summaryColumnMappings.push({
        columnIndex,
        columnKey: summaryColumnKey,
      })
    }
  })

  return {
    staticColumnMappings,
    summaryColumnMappings,
    operationColumns,
  }
}

function buildRowsFromMatrixSheet(
  sheetRows: RawSheetRow[],
  category: CategoryConfigEntry,
  fileName: string,
  sheetName: string,
  errors: string[],
): ParsedInventoryRow[] {
  if (sheetRows.length < 2) {
    return []
  }

  const { primaryHeaderRow, secondaryHeaderRow, dataRows } = getHeaderRows(sheetRows)

  if (!secondaryHeaderRow) {
    return buildRowsFromFlatSheet(sheetRows, category, fileName, sheetName, errors)
  }

  const { staticColumnMappings, summaryColumnMappings, operationColumns } =
    buildMatrixStructure(primaryHeaderRow, secondaryHeaderRow, category)

  return dataRows.reduce<ParsedInventoryRow[]>((rows, currentRow) => {
    if (!Array.isArray(currentRow)) {
      return rows
    }

    const staticValues: Record<string, ParsedCellValue> = {}
    const summaryValues: Record<string, ParsedCellValue> = {}

    staticColumnMappings.forEach((mapping) => {
      staticValues[mapping.columnKey] = convertCellValue(
        currentRow[mapping.columnIndex],
        mapping.columnKey,
        category,
      )
    })

    summaryColumnMappings.forEach((mapping) => {
      summaryValues[mapping.columnKey] = convertCellValue(
        currentRow[mapping.columnIndex],
        mapping.columnKey,
        category,
      )
    })

    const transactionRows = operationColumns.reduce<ParsedInventoryRow[]>(
      (transactionAccumulator, operationColumn) => {
        const rawValue = currentRow[operationColumn.columnIndex]
        const numericValue = convertCellValue(
          rawValue,
          operationColumn.operation,
          category,
        )

        if (numericValue === null || numericValue === 0) {
          return transactionAccumulator
        }

        transactionAccumulator.push({
          ...staticValues,
          ...summaryValues,
          transaction_date: operationColumn.transactionDate,
          issued: operationColumn.operation === 'issued' ? numericValue : 0,
          added: operationColumn.operation === 'added' ? numericValue : 0,
          source_file: fileName,
          source_sheet: sheetName,
        })

        return transactionAccumulator
      },
      [],
    )

    if (transactionRows.length > 0) {
      rows.push(...transactionRows)
      return rows
    }

    const fallbackRow: Record<string, ParsedCellValue> = {
      ...staticValues,
      ...summaryValues,
    }

    if (category.dateField && !(category.dateField in fallbackRow)) {
      fallbackRow[category.dateField] = null
    }

    if ('issued' in category.columns && !('issued' in fallbackRow)) {
      fallbackRow.issued = 0
    }

    if ('added' in category.columns && !('added' in fallbackRow)) {
      fallbackRow.added = 0
    }

    if (isRowEmpty(fallbackRow)) {
      return rows
    }

    rows.push({
      ...fallbackRow,
      source_file: fileName,
      source_sheet: sheetName,
    })

    return rows
  }, [])
}

function shouldUseMatrixParsing(sheetRows: RawSheetRow[]): boolean {
  const secondRow = sheetRows[1] ?? []
  const operationCount = secondRow.filter((cell) => isOperationLabel(cell)).length
  return operationCount >= 4
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

    const parsedRows = shouldUseMatrixParsing(sheetRows)
      ? buildRowsFromMatrixSheet(
          sheetRows,
          category,
          file.name,
          sheetName,
          errors,
        )
      : buildRowsFromFlatSheet(
          sheetRows,
          category,
          file.name,
          sheetName,
          errors,
        )

    rowsByTable[category.table] = (rowsByTable[category.table] ?? []).concat(
      parsedRows,
    )
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
