import type * as XLSX from 'xlsx'
import { buildImportKey, buildItemKey } from './identity'
import {
  displayExcelText,
  formatJulyDate,
  normalizeHeader,
  normalizeMatchText,
  parseExcelDate,
  parseExcelNumber,
} from './normalization'
import type { CustomSheetConfig } from './sheetConfig'
import type {
  CustomInventoryFields,
  CustomInventoryItem,
  CustomInventoryMovement,
  SheetParseResult,
  StockTableName,
} from './types'
import { buildWorkbookGrid, getGridCell, getGridText, type WorkbookGrid } from './workbookGrid'

const ITEM_ALIASES = ['الصنف', 'اسم الصنف', 'البيان', 'النوع']
const PROJECT_ALIASES = ['الاسم', 'المشروع', 'اسم المشروع']
const FINAL_BALANCE_ALIASES = ['رصيد مخزني', 'الرصيد المخزني', 'رصيد المخزن', 'الرصيد']
const DIN_ALIASES = ['din', 'كود din']
const CODE_ALIASES = ['code number', 'coodnumber', 'رقم الكود', 'رقم الصنف']
const LENGTH_ALIASES = ['length', 'الطول']
const WIDTH_ALIASES = ['width', 'العرض']
const TH_ALIASES = ['th', 'thickness', 'السمك']
const WEIGHT_ALIASES = ['الوزن', 'وزن', 'weight']

const CATEGORY_NAMES: Record<StockTableName, string> = {
  consumables: 'مستهلكات',
  paints: 'الدهانات',
  screws: 'مسامير',
  stock_screws: 'مسامير استوك',
  raw_materials: 'خامات',
  cylinders: 'اسطوانات',
}

type MovementColumn = {
  column: number
  day: number
  operationType: 'add' | 'issue'
}

type HeaderDetection = {
  headerRow: number
  dayRow: number
  itemColumn: number
  projectColumn: number | null
  openingColumn: number
  finalBalanceColumn: number
  movementColumns: MovementColumn[]
  dinColumn: number | null
  codeColumn: number | null
  lengthColumn: number | null
  widthColumn: number | null
  thColumn: number | null
  weightColumn: number | null
  warnings: string[]
}

function matchesAlias(value: string, alias: string) {
  const normalized = normalizeHeader(value)
  const normalizedAlias = normalizeHeader(alias)
  return normalized === normalizedAlias || normalized.startsWith(normalizedAlias)
}

export function findColumnByAliases(
  grid: WorkbookGrid,
  row: number,
  aliases: readonly string[],
): number | null {
  const columns = [...(grid.rows.get(row)?.keys() ?? [])].sort((left, right) => left - right)
  return columns.find((column) => aliases.some((alias) => matchesAlias(getGridText(grid, row, column), alias))) ?? null
}

function operationType(value: string): 'add' | 'issue' | null {
  const normalized = normalizeHeader(value)
  if (normalized === normalizeHeader('إضافة') || normalized === normalizeHeader('اضافه')) return 'add'
  if (normalized === normalizeHeader('صرف')) return 'issue'
  return null
}

function parseDay(value: string): number | null {
  const normalized = value.trim()
  if (!/^\d{1,2}$/.test(normalized)) return null
  const day = Number(normalized)
  return day >= 1 && day <= 31 ? day : null
}

function findHeaderRow(grid: WorkbookGrid): number | null {
  let best: { row: number; score: number } | null = null
  for (const row of grid.rowNumbers.filter((value) => value < 40)) {
    const cells = [...(grid.rows.get(row)?.values() ?? [])]
    const operations = cells.filter((cell) => operationType(cell.formatted)).length
    const hasItem = [...(grid.rows.get(row)?.values() ?? [])].some((cell) =>
      ITEM_ALIASES.some((alias) => matchesAlias(cell.formatted, alias)),
    )
    const score = operations * 2 + (hasItem ? 5 : 0)
    if (operations >= 2 && (!best || score > best.score)) best = { row, score }
  }
  return best?.row ?? null
}

function findDayRow(grid: WorkbookGrid, headerRow: number): number {
  let bestRow = Math.max(0, headerRow - 1)
  let bestCount = -1
  for (let row = Math.max(0, headerRow - 3); row <= headerRow; row += 1) {
    const dayCount = [...(grid.rows.get(row)?.values() ?? [])]
      .filter((cell) => parseDay(cell.formatted) !== null).length
    if (dayCount > bestCount) {
      bestCount = dayCount
      bestRow = row
    }
  }
  return bestRow
}

function findAcrossHeaderRows(
  grid: WorkbookGrid,
  headerRow: number,
  dayRow: number,
  aliases: readonly string[],
): number | null {
  return findColumnByAliases(grid, headerRow, aliases) ?? findColumnByAliases(grid, dayRow, aliases)
}

function findOpeningColumn(grid: WorkbookGrid, headerRow: number, dayRow: number): number | null {
  for (const row of new Set([headerRow, dayRow])) {
    for (const [column, cell] of grid.rows.get(row)?.entries() ?? []) {
      if (parseExcelDate(cell.value, cell.formatted) === '2026-06-30') return column
      const normalized = normalizeHeader(cell.formatted)
      if (['30062026', '3062026', '63026', '306206'].includes(normalized)) return column
    }
  }
  return null
}

function detectMovementColumns(grid: WorkbookGrid, headerRow: number, dayRow: number): MovementColumn[] {
  const operations = [...(grid.rows.get(headerRow)?.entries() ?? [])]
    .map(([column, cell]) => ({ column, operationType: operationType(cell.formatted) }))
    .filter((entry): entry is { column: number; operationType: 'add' | 'issue' } => entry.operationType !== null)
    .sort((left, right) => left.column - right.column)

  const result: MovementColumn[] = []
  let currentDay: number | null = null
  let previousColumn = -2
  for (const entry of operations) {
    const explicitDay = parseDay(getGridText(grid, dayRow, entry.column))
    if (explicitDay !== null) currentDay = explicitDay
    else if (entry.column - previousColumn > 1) currentDay = null

    if (currentDay !== null) {
      result.push({ ...entry, day: currentDay })
    }
    previousColumn = entry.column
  }
  return result
}

function detectHeaders(grid: WorkbookGrid): HeaderDetection | null {
  const headerRow = findHeaderRow(grid)
  if (headerRow === null) return null
  const dayRow = findDayRow(grid, headerRow)
  const movementColumns = detectMovementColumns(grid, headerRow, dayRow)
  const itemColumn = findColumnByAliases(grid, headerRow, ITEM_ALIASES)
  const finalBalanceColumn = findAcrossHeaderRows(grid, headerRow, dayRow, FINAL_BALANCE_ALIASES)
  let openingColumn = findOpeningColumn(grid, headerRow, dayRow)
  const warnings: string[] = []

  if (openingColumn === null && movementColumns.length > 0) {
    openingColumn = Math.min(...movementColumns.map((movement) => movement.column)) - 1
    warnings.push('تم استنتاج عمود رصيد 30/06/2026 من موضعه قبل أول أعمدة الحركة.')
  }

  if (itemColumn === null || openingColumn === null || finalBalanceColumn === null || movementColumns.length === 0) {
    return null
  }

  let projectColumn = findColumnByAliases(grid, headerRow, PROJECT_ALIASES)
  if (projectColumn === null) {
    for (let row = headerRow + 1; row <= headerRow + 3; row += 1) {
      projectColumn = findColumnByAliases(grid, row, PROJECT_ALIASES)
      if (projectColumn !== null) break
    }
  }
  const dinColumn = findColumnByAliases(grid, headerRow, DIN_ALIASES)
  let codeColumn = findColumnByAliases(grid, headerRow, CODE_ALIASES)
  if (codeColumn === null && dinColumn !== null && openingColumn - dinColumn > 1) {
    codeColumn = openingColumn - 1
    warnings.push('تم استنتاج عمود رقم الكود من موضعه بين DIN ورصيد 30/06/2026.')
  }

  return {
    headerRow,
    dayRow,
    itemColumn,
    projectColumn,
    openingColumn,
    finalBalanceColumn,
    movementColumns,
    dinColumn,
    codeColumn,
    lengthColumn: findColumnByAliases(grid, headerRow, LENGTH_ALIASES),
    widthColumn: findColumnByAliases(grid, headerRow, WIDTH_ALIASES),
    thColumn: findColumnByAliases(grid, headerRow, TH_ALIASES),
    weightColumn: findColumnByAliases(grid, headerRow, WEIGHT_ALIASES),
    warnings,
  }
}

function parseTextField(grid: WorkbookGrid, row: number, column: number | null): string {
  return column === null ? '' : displayExcelText(getGridCell(grid, row, column)?.value)
}

function parseOptionalNumberField(
  grid: WorkbookGrid,
  row: number,
  column: number | null,
  fieldLabel: string,
  warnings: string[],
): { value: number | null; raw: string | null } {
  if (column === null) return { value: null, raw: null }
  const cell = getGridCell(grid, row, column)
  if (!cell) return { value: null, raw: null }
  const parsed = parseExcelNumber(cell.value)
  if (parsed === null && cell.formatted) {
    warnings.push(`صف ${row + 1}: تعذر تحويل ${fieldLabel} "${cell.formatted}" إلى رقم؛ تم حفظ النص الأصلي.`)
    return { value: null, raw: cell.formatted }
  }
  return { value: parsed, raw: null }
}

function paintProjectFromHeader(headerText: string): string | null {
  const normalizedAlias = normalizeMatchText('الصنف')
  const normalized = normalizeMatchText(headerText)
  if (!normalized.startsWith(normalizedAlias)) return null
  const remainder = displayExcelText(headerText).replace(/^\s*الصنف\s*/u, '')
  return remainder || null
}

function isPaintSection(value: string) {
  const normalized = normalizeMatchText(value).replace(/\s+/g, '')
  return /^(amset\d*|etalia|italy|انشاظ)$/.test(normalized)
}

function isRepeatedOrDecorativeRow(
  config: CustomSheetConfig,
  itemName: string,
  projectName: string,
  din: string,
  codeNumber: string,
) {
  const normalizedItem = normalizeHeader(itemName)
  if (!normalizedItem) return true
  if (ITEM_ALIASES.some((alias) => normalizedItem === normalizeHeader(alias))) return true
  if (PROJECT_ALIASES.some((alias) => normalizeHeader(projectName) === normalizeHeader(alias))) return true
  if (DIN_ALIASES.some((alias) => normalizeHeader(din) === normalizeHeader(alias))) return true
  if (CODE_ALIASES.some((alias) => normalizeHeader(codeNumber) === normalizeHeader(alias))) return true
  if (config.materialSource && normalizeMatchText(itemName) === normalizeMatchText(config.materialSource)) return true
  return false
}

function getRawFields(
  grid: WorkbookGrid,
  row: number,
  headers: HeaderDetection,
  config: CustomSheetConfig,
  itemName: string,
  warnings: string[],
): CustomInventoryFields {
  const length = parseOptionalNumberField(grid, row, headers.lengthColumn, 'LENGTH', warnings)
  const width = parseOptionalNumberField(grid, row, headers.widthColumn, 'WIDTH', warnings)
  const th = parseOptionalNumberField(grid, row, headers.thColumn, 'TH', warnings)
  const weight = parseOptionalNumberField(grid, row, headers.weightColumn, 'الوزن', warnings)
  const dimensionParts = [length.raw, width.raw, th.raw, weight.raw].filter(Boolean)
  if (
    config.tableName === 'raw_materials' &&
    headers.lengthColumn === null &&
    headers.widthColumn === null &&
    headers.thColumn === null
  ) {
    dimensionParts.push(itemName)
  }

  return {
    din: parseTextField(grid, row, headers.dinColumn) || undefined,
    code_number: parseTextField(grid, row, headers.codeColumn) || undefined,
    length: length.value,
    width: width.value,
    th: th.value,
    weight: weight.value,
    dimension_text: dimensionParts.length > 0 ? dimensionParts.join(' | ') : null,
    material_source: config.materialSource,
  }
}

export function parseNormalStockSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  fileName: string,
  config: CustomSheetConfig,
): SheetParseResult {
  const result: SheetParseResult = {
    items: [],
    movements: [],
    cuttingDiscs: [],
    longWeldingGloves: [],
    errors: [],
    warnings: [],
    skippedRows: 0,
  }
  const tableName = config.tableName
  if (!tableName || tableName === 'cylinders') return result

  const grid = buildWorkbookGrid(sheet)
  const headers = detectHeaders(grid)
  if (!headers) {
    result.errors.push(`تعذر اكتشاف رؤوس الأعمدة الأساسية في الشيت "${sheetName}".`)
    return result
  }
  result.warnings.push(...headers.warnings.map((warning) => `${sheetName}: ${warning}`))

  let currentProject = config.defaultProject ?? sheetName.trim()
  if (config.paintSections) {
    currentProject = paintProjectFromHeader(getGridText(grid, headers.headerRow, headers.itemColumn)) ?? currentProject
  }

  for (const row of grid.rowNumbers.filter((rowNumber) => rowNumber > headers.headerRow)) {
    const itemName = parseTextField(grid, row, headers.itemColumn)
    const projectCell = parseTextField(grid, row, headers.projectColumn)
    const din = parseTextField(grid, row, headers.dinColumn)
    const codeNumber = parseTextField(grid, row, headers.codeColumn)
    const openingCell = getGridCell(grid, row, headers.openingColumn)
    const finalCell = getGridCell(grid, row, headers.finalBalanceColumn)
    const hasMovementCell = headers.movementColumns.some(({ column }) => getGridCell(grid, row, column) !== undefined)
    const hasInventoryData = openingCell !== undefined || finalCell !== undefined || hasMovementCell
    const hasNonZeroInventoryData = [
      parseExcelNumber(openingCell?.value),
      parseExcelNumber(finalCell?.value),
      ...headers.movementColumns.map(({ column }) => parseExcelNumber(getGridCell(grid, row, column)?.value)),
    ].some((value) => value !== null && value !== 0)

    if (config.paintSections && itemName && isPaintSection(itemName) && !hasMovementCell) {
      currentProject = itemName
      result.skippedRows += 1
      continue
    }

    const projectName = projectCell || currentProject
    if (!itemName) {
      if (hasNonZeroInventoryData) {
        result.errors.push(`الشيت "${sheetName}" - الصف ${row + 1}: يوجد رصيد أو حركة بدون اسم صنف.`)
      } else {
        result.skippedRows += 1
      }
      continue
    }

    if (isRepeatedOrDecorativeRow(config, itemName, projectCell, din, codeNumber)) {
      result.skippedRows += 1
      continue
    }
    if (!hasInventoryData) {
      result.skippedRows += 1
      continue
    }

    const finalBalance = parseExcelNumber(finalCell?.value)
    if (finalBalance === null) {
      result.errors.push(`الشيت "${sheetName}" - الصف ${row + 1}: رصيد مخزني النهائي مفقود أو غير رقمي.`)
      continue
    }

    const openingBalance = parseExcelNumber(openingCell?.value) ?? 0
    const fields = getRawFields(grid, row, headers, config, itemName, result.warnings)
    const itemKey = buildItemKey({ tableName, projectName, itemName, fields })
    let runningBalance = openingBalance
    let totalAdded = 0
    let totalIssued = 0
    const itemMovements: CustomInventoryMovement[] = []

    const orderedColumns = [...headers.movementColumns].sort(
      (left, right) => left.day - right.day || left.column - right.column,
    )
    for (const movementColumn of orderedColumns) {
      const rawQuantity = parseExcelNumber(getGridCell(grid, row, movementColumn.column)?.value) ?? 0
      if (rawQuantity === 0) continue
      const quantity = Math.abs(rawQuantity)
      if (rawQuantity < 0) {
        result.warnings.push(
          `${sheetName} - الصف ${row + 1}: تم استخدام القيمة المطلقة للحركة السالبة في اليوم ${movementColumn.day}.`,
        )
      }
      const previousBalance = runningBalance
      runningBalance = movementColumn.operationType === 'add'
        ? runningBalance + quantity
        : runningBalance - quantity
      if (movementColumn.operationType === 'add') totalAdded += quantity
      else totalIssued += quantity

      const movementWithoutKey: Omit<CustomInventoryMovement, 'import_key'> = {
        table_name: tableName,
        item_key: itemKey,
        project_name: projectName,
        category_name: CATEGORY_NAMES[tableName],
        item_name: itemName,
        operation_type: movementColumn.operationType,
        operation_date: formatJulyDate(movementColumn.day),
        quantity,
        previous_balance: previousBalance,
        new_balance: runningBalance,
        source: {
          file_name: fileName,
          sheet: sheetName,
          row: row + 1,
          column: movementColumn.column + 1,
        },
      }
      itemMovements.push({ ...movementWithoutKey, import_key: buildImportKey(movementWithoutKey) })
    }

    if (Math.abs(runningBalance - finalBalance) > 1e-9) {
      const adjustmentWithoutKey: Omit<CustomInventoryMovement, 'import_key'> = {
        table_name: tableName,
        item_key: itemKey,
        project_name: projectName,
        category_name: CATEGORY_NAMES[tableName],
        item_name: itemName,
        operation_type: 'adjust',
        operation_date: '2026-07-31',
        quantity: Math.abs(finalBalance - runningBalance),
        previous_balance: runningBalance,
        new_balance: finalBalance,
        notes: 'تسوية نهاية الشهر حسب رصيد مخزني في ملف يوليو 2026',
        source: { file_name: fileName, sheet: sheetName, row: row + 1 },
      }
      itemMovements.push({ ...adjustmentWithoutKey, import_key: buildImportKey(adjustmentWithoutKey) })
      result.warnings.push(
        `${sheetName} - الصف ${row + 1}: الرصيد المحسوب ${runningBalance} يختلف عن رصيد مخزني ${finalBalance}؛ أضيفت حركة تسوية.`,
      )
    }

    const item: CustomInventoryItem = {
      table_name: tableName,
      item_key: itemKey,
      project_name: projectName,
      item_name: itemName,
      opening_balance: openingBalance,
      total_added: totalAdded,
      total_issued: totalIssued,
      stock_balance: finalBalance,
      transaction_date: '2026-07-31',
      source: { file_name: fileName, sheet: sheetName, row: row + 1 },
      fields,
    }
    result.items.push(item)
    result.movements.push(...itemMovements)
  }

  return result
}
