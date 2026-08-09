import * as XLSX from 'xlsx'
import {
  categoryConfig,
  type CategoryConfigEntry,
  type CategoryKey,
} from '../config/categoryConfig'

type ParsedCellValue = string | number | boolean | null
type RawSheetRow = unknown[]
type ParserType = 'stock-matrix' | 'custody-records' | 'cylinder-matrix'

type RawMaterialsSheetContext = {
  projectName: string | null
  materialSource: string | null
}

export type ParsedInventoryRow = Record<string, ParsedCellValue> & {
  source_file: string
  source_sheet: string
}

export type ParsedRowsByTable = Record<string, ParsedInventoryRow[]>

export type SheetImportDiagnosis = {
  originalSheetName: string
  normalizedSheetName: string
  matchedCategory: CategoryKey | null
  targetTable: string | null
  parserType: ParserType | null
  sourceRowCount: number
  parsedItemsCount: number
  parsedMovementsCount: number
  skippedRowsCount: number
  warnings: string[]
  errors: string[]
}

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
  warnings: string[]
  sheetDiagnoses: SheetImportDiagnosis[]
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

const stockMatrixCategories = new Set<CategoryKey>([
  'consumables',
  'paints',
  'screws',
  'stock_screws',
  'raw_materials',
])

export function normalizeArabicText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    .replace(/[٠-٩۰-۹]/g, (digit) => arabicDigitMap[digit] ?? digit)
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function compactText(value: string | null | undefined): string {
  return normalizeArabicText(value).replace(/[^\p{L}\p{N}+]/gu, '')
}

export function getCategoryBySheetName(sheetName: string): {
  key: CategoryKey
  label: string
  table: string
  parserType: ParserType
} | null {
  const normalized = compactText(sheetName)

  const candidates = (Object.entries(categoryConfig) as Array<
    [CategoryKey, CategoryConfigEntry]
  >)
    .flatMap(([key, category]) =>
      [category.label, ...(category.aliases ?? [])].map((alias) => ({
        key,
        category,
        alias: compactText(alias),
      })),
    )
    .sort((left, right) => right.alias.length - left.alias.length)

  const candidate = candidates.find(({ alias }) => normalized.includes(alias))

  if (!candidate) {
    return null
  }

  return {
    key: candidate.key,
    label: candidate.category.label,
    table: candidate.category.table,
    parserType: stockMatrixCategories.has(candidate.key)
      ? 'stock-matrix'
      : 'custody-records',
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim()
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const normalized = cellText(value)
    .replace(/[٠-٩۰-۹]/g, (digit) => arabicDigitMap[digit] ?? digit)
    .replace(/[٬,]/g, '')
    .replace(/٫/g, '.')

  if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value)
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    return parsed ? formatDate(new Date(parsed.y, parsed.m - 1, parsed.d)) : null
  }

  const text = cellText(value)
  if (!text) {
    return null
  }

  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!match) {
    return null
  }

  const [, month, day, yearValue] = match
  const year = Number(yearValue.length === 2 ? `20${yearValue}` : yearValue)
  const date = new Date(year, Number(month) - 1, Number(day))
  return Number.isNaN(date.getTime()) ? null : formatDate(date)
}

function operationType(value: unknown): 'issued' | 'added' | null {
  const normalized = compactText(cellText(value))

  if (normalized === compactText('صرف')) {
    return 'issued'
  }

  if (
    normalized === compactText('اضافه') ||
    normalized === compactText('إضافة')
  ) {
    return 'added'
  }

  return null
}

function findOperationStart(header: RawSheetRow): number {
  return header.findIndex((cell) => operationType(cell) !== null)
}

const expireDateHeaderAliases = [
  'تاريخ الانتهاء',
  'Expire Date',
  'Expiry Date',
  'expiration date',
]

function findExpireDateColumn(...headerRows: RawSheetRow[]): number {
  const aliases = new Set(expireDateHeaderAliases.map(compactText))
  const maxLength = Math.max(0, ...headerRows.map((row) => row.length))

  for (let columnIndex = 0; columnIndex < maxLength; columnIndex += 1) {
    if (
      headerRows.some((row) => aliases.has(compactText(cellText(row[columnIndex]))))
    ) {
      return columnIndex
    }
  }

  return -1
}

function getRawMaterialsSheetContext(sheetName: string): RawMaterialsSheetContext {
  const normalizedSheetName = normalizeArabicText(sheetName)

  if (normalizedSheetName.includes('كونز')) {
    return {
      projectName: 'خامات كونز4',
      materialSource: 'خامات كونز4',
    }
  }

  if (
    normalizedSheetName.includes('الفتح') ||
    normalizedSheetName.includes('amset3')
  ) {
    return {
      projectName: 'خامات الفتح amset3',
      materialSource: null,
    }
  }

  return {
    projectName: null,
    materialSource: null,
  }
}

function getRawMaterialItemName(
  row: RawSheetRow,
  sheetContext: RawMaterialsSheetContext,
) {
  if (sheetContext.materialSource === 'خامات كونز4') {
    return cellText(row[3]) || cellText(row[0]) || null
  }

  return cellText(row[0]) || cellText(row[3]) || null
}

function matrixStaticValues(
  category: CategoryKey,
  row: RawSheetRow,
  sheetName: string,
): Record<string, ParsedCellValue> {
  switch (category) {
    case 'consumables':
      return {
        project: cellText(row[0]) || null,
        item_name: cellText(row[1]) || null,
      }
    case 'paints':
      return { item_name: cellText(row[0]) || null }
    case 'screws':
      return {
        project: cellText(row[0]) || null,
        item_name: cellText(row[1]) || null,
        din: cellText(row[2]) || null,
        code_number: cellText(row[3]) || null,
      }
    case 'stock_screws':
      return {
        item_name: cellText(row[0]) || null,
        din: cellText(row[1]) || null,
        code_number: cellText(row[2]) || null,
      }
    case 'raw_materials': {
      const sheetContext = getRawMaterialsSheetContext(sheetName)
      const rowProject = cellText(row[0]) || null

      return {
        project: sheetContext.projectName ?? rowProject,
        item_name: getRawMaterialItemName(row, sheetContext),
        weight:
          sheetContext.materialSource === 'خامات كونز4' ? toNumber(row[5]) : null,
        length:
          sheetContext.materialSource === 'خامات كونز4' ? toNumber(row[6]) : null,
        width:
          sheetContext.materialSource === 'خامات كونز4' ? toNumber(row[7]) : null,
        th:
          sheetContext.materialSource === 'خامات كونز4' ? toNumber(row[8]) : null,
        material_source: sheetContext.materialSource,
      }
    }
    default:
      return {}
  }
}

function parseStockMatrix(
  rows: RawSheetRow[],
  category: CategoryKey,
  fileName: string,
  sheetName: string,
  diagnosis: SheetImportDiagnosis,
): ParsedInventoryRow[] {
  const firstHeader = rows[0] ?? []
  const secondHeader = rows[1] ?? []
  const operationStart = findOperationStart(secondHeader)
  const expireDateColumn =
    category === 'paints' ? findExpireDateColumn(firstHeader, secondHeader) : -1
  const baseDateColumn = operationStart - 1
  const baseDate = toDate(secondHeader[baseDateColumn])

  if (operationStart < 1 || !baseDate) {
    diagnosis.errors.push(
      'لم يتم العثور على تاريخ البداية أو أعمدة صرف/إضافة في جدول الحركات.',
    )
    return []
  }

  const result: ParsedInventoryRow[] = []
  const summaryStart = secondHeader.length - 3

  rows.slice(2).forEach((row) => {
    const values = matrixStaticValues(category, row, sheetName)
    if (category === 'paints') {
      values.expire_date =
        expireDateColumn >= 0 ? toDate(row[expireDateColumn]) : null
    }
    const name = cellText(values.item_name)

    if (!name) {
      diagnosis.skippedRowsCount += 1
      return
    }

    const summary = {
      total_added: toNumber(row[summaryStart]),
      total_issued: toNumber(row[summaryStart + 1]),
      stock_balance: toNumber(row[summaryStart + 2]),
    }
    const openingQuantity = toNumber(row[baseDateColumn])

    if (openingQuantity !== null && openingQuantity !== 0) {
      result.push({
        ...values,
        ...summary,
        transaction_date: baseDate,
        added: openingQuantity,
        issued: 0,
        source_file: fileName,
        source_sheet: sheetName,
      })
    }

    for (let columnIndex = operationStart; columnIndex < summaryStart; columnIndex += 1) {
      const operation = operationType(secondHeader[columnIndex])
      const quantity = toNumber(row[columnIndex])

      if (!operation || quantity === null || quantity === 0) {
        continue
      }

      const day =
        toNumber(firstHeader[columnIndex]) ?? toNumber(firstHeader[columnIndex - 1])
      const anchor = new Date(`${baseDate}T00:00:00`)
      const transactionDate =
        day === null
          ? baseDate
          : formatDate(new Date(anchor.getFullYear(), anchor.getMonth() + 1, day))

      result.push({
        ...values,
        ...summary,
        transaction_date: transactionDate,
        added: operation === 'added' ? quantity : 0,
        issued: operation === 'issued' ? quantity : 0,
        source_file: fileName,
        source_sheet: sheetName,
      })
    }

    const hasExistingMovement = result.some(
      (parsed) =>
        parsed.source_sheet === sheetName &&
        cellText(parsed.item_name) === name &&
        cellText(parsed.project) === cellText(values.project),
    )

    if (openingQuantity === null && !hasExistingMovement) {
      diagnosis.skippedRowsCount += 1
    }
  })

  return result
}

function parseCuttingDiscs(
  rows: RawSheetRow[],
  fileName: string,
  sheetName: string,
): ParsedInventoryRow[] {
  return rows.slice(1).flatMap((row) => {
    const code = cellText(row[0])
    const typeName = cellText(row[1])

    if (!code || !typeName) {
      return []
    }

    return [
      {
        code,
        type_name: typeName,
        received_by: cellText(row[2]) || null,
        received_date: toDate(row[3]),
        scrapped_date: toDate(row[4]),
        source_file: fileName,
        source_sheet: sheetName,
      },
    ]
  })
}

function parseLongWeldingGloves(
  rows: RawSheetRow[],
  fileName: string,
  sheetName: string,
): ParsedInventoryRow[] {
  const header = rows[0] ?? []

  return rows.slice(1).flatMap((row) => {
    const receivedDate = toDate(row[0])
    const receivedBy = cellText(row[1])

    return header.slice(2).flatMap((headerCell, offset) => {
      const quantity = toNumber(row[offset + 2])
      const typeName = cellText(headerCell)

      if (!receivedDate || !receivedBy || !typeName || quantity === null || quantity <= 0) {
        return []
      }

      return [
        {
          type_name: typeName,
          received_by: receivedBy,
          received_date: receivedDate,
          source_file: fileName,
          source_sheet: sheetName,
        },
      ]
    })
  })
}

function parseCylinders(
  rows: RawSheetRow[],
  fileName: string,
  sheetName: string,
): ParsedInventoryRow[] {
  const groupHeader = rows[0] ?? []
  const fieldHeader = rows[1] ?? []
  const groups: Array<{
    typeName: string
    full?: number
    empty?: number
    balance?: number
  }> = []
  let currentType = ''

  fieldHeader.forEach((field, columnIndex) => {
    const headerType = cellText(groupHeader[columnIndex])
    if (headerType) {
      currentType = headerType
    }

    const normalizedField = compactText(cellText(field))
    if (!currentType) {
      return
    }

    let group = groups.at(-1)
    if (!group || group.typeName !== currentType) {
      group = { typeName: currentType }
      groups.push(group)
    }

    if (normalizedField.includes(compactText('ملي'))) {
      group.full = columnIndex
    }

    if (normalizedField.includes(compactText('فارغ'))) {
      group.empty = columnIndex
    }

    if (normalizedField.includes(compactText('رصيد'))) {
      group.balance = columnIndex
    }
  })

  return rows.slice(2).flatMap((row) => {
    const transactionDate = toDate(row[0])

    if (!transactionDate) {
      return []
    }

    return groups.flatMap((group) => {
      const full = group.full === undefined ? null : toNumber(row[group.full])
      const empty = group.empty === undefined ? null : toNumber(row[group.empty])
      const balance = group.balance === undefined ? null : toNumber(row[group.balance])

      if (full === null && empty === null && balance === null) {
        return []
      }

      return [
        {
          type_name: group.typeName,
          full_count: full,
          empty_count: empty,
          gas_balance: balance,
          transaction_date: transactionDate,
          notes: cellText(row.at(-1)) || null,
          source_file: fileName,
          source_sheet: sheetName,
        },
      ]
    })
  })
}

function countItems(rows: readonly ParsedInventoryRow[]): number {
  return new Set(
    rows.map(
      (row) =>
        [
          cellText(row.project),
          cellText(row.item_name),
          cellText(row.weight),
          cellText(row.length),
          cellText(row.width),
          cellText(row.th),
          cellText(row.material_source),
        ].join('::'),
    ),
  ).size
}

export async function parseInventoryExcel(file: File): Promise<ExcelImportPreview> {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: true,
  })
  const rowsByTable: ParsedRowsByTable = {}
  const matchedSheets: ExcelImportPreview['matchedSheets'] = []
  const ignoredSheets: string[] = []
  const sheetDiagnoses: SheetImportDiagnosis[] = []
  const errors: string[] = []
  const warnings: string[] = []
  let totalRows = 0

  workbook.SheetNames.forEach((sheetName) => {
    const match = getCategoryBySheetName(sheetName)
    const diagnosis: SheetImportDiagnosis = {
      originalSheetName: sheetName,
      normalizedSheetName: normalizeArabicText(sheetName),
      matchedCategory: match?.key ?? null,
      targetTable: match?.table ?? null,
      parserType: match?.parserType ?? null,
      sourceRowCount: 0,
      parsedItemsCount: 0,
      parsedMovementsCount: 0,
      skippedRowsCount: 0,
      warnings: [],
      errors: [],
    }
    sheetDiagnoses.push(diagnosis)

    if (!match) {
      ignoredSheets.push(sheetName)
      diagnosis.warnings.push('لم يتم العثور على فئة أو جدول Supabase مطابق لاسم الشيت.')
      warnings.push(`Sheet "${sheetName}" was skipped: ${diagnosis.warnings[0]}`)
      return
    }

    try {
      const worksheet = workbook.Sheets[sheetName]
      if (!worksheet) {
        throw new Error('تعذر قراءة محتوى الشيت من ملف Excel.')
      }

      const rows = XLSX.utils.sheet_to_json<RawSheetRow>(worksheet, {
        header: 1,
        defval: null,
        raw: true,
        blankrows: false,
      })

      diagnosis.sourceRowCount = Math.max(
        rows.length -
          (match.parserType === 'stock-matrix' || match.parserType === 'cylinder-matrix'
            ? 2
            : 1),
        0,
      )

      const matchedCategoryKey: string = match.key
      const parsedRows =
        match.parserType === 'stock-matrix'
          ? parseStockMatrix(rows, match.key, file.name, sheetName, diagnosis)
          : matchedCategoryKey === 'cutting_discs'
            ? parseCuttingDiscs(rows, file.name, sheetName)
            : matchedCategoryKey === 'long_welding_gloves'
              ? parseLongWeldingGloves(rows, file.name, sheetName)
              : parseCylinders(rows, file.name, sheetName)

      if (matchedCategoryKey === 'cylinders') {
        diagnosis.warnings.push(
          'تم تحليل أرصدة الأسطوانات كسجلات حالة؛ لم يتم إنشاء حركات إضافة أو صرف.',
        )
        warnings.push(`Sheet "${sheetName}": ${diagnosis.warnings[0]}`)
      }

      diagnosis.parsedItemsCount = countItems(parsedRows)
      diagnosis.parsedMovementsCount = parsedRows.filter(
        (row) => toNumber(row.added) !== null || toNumber(row.issued) !== null,
      ).length

      rowsByTable[match.table] = [...(rowsByTable[match.table] ?? []), ...parsedRows]
      totalRows += parsedRows.length
      matchedSheets.push({
        sheetName,
        categoryKey: match.key,
        table: match.table,
        rowCount: parsedRows.length,
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'خطأ غير معروف أثناء تحليل الشيت.'

      diagnosis.errors.push(message)
      errors.push(`Sheet "${sheetName}": ${message}`)
    }
  })

  return {
    fileName: file.name,
    matchedSheets,
    ignoredSheets,
    totalRows,
    rowsByTable,
    errors,
    warnings,
    sheetDiagnoses,
  }
}
