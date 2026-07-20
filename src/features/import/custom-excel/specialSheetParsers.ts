import type * as XLSX from 'xlsx'
import { buildItemKey } from './identity'
import {
  displayExcelText,
  normalizeHeader,
  normalizeKeyPart,
  normalizeMatchText,
  parseExcelDate,
  parseExcelNumber,
} from './normalization'
import type { CustomSheetConfig } from './sheetConfig'
import type {
  CustomCuttingDisc,
  CustomInventoryItem,
  CustomWeldingGlove,
  SheetParseResult,
} from './types'
import { buildWorkbookGrid, getGridCell, getGridText, type WorkbookGrid } from './workbookGrid'

function emptyResult(): SheetParseResult {
  return {
    items: [],
    movements: [],
    cuttingDiscs: [],
    longWeldingGloves: [],
    errors: [],
    warnings: [],
    skippedRows: 0,
  }
}

function findHeaderRow(grid: WorkbookGrid, requiredAliases: readonly string[]): number | null {
  for (const row of grid.rowNumbers.filter((value) => value < 40)) {
    const headers = [...(grid.rows.get(row)?.values() ?? [])].map((cell) => normalizeHeader(cell.formatted))
    if (requiredAliases.every((alias) => headers.some((header) => header.includes(normalizeHeader(alias))))) {
      return row
    }
  }
  return null
}

function findColumn(grid: WorkbookGrid, row: number, aliases: readonly string[]): number | null {
  for (const [column, cell] of grid.rows.get(row)?.entries() ?? []) {
    const header = normalizeHeader(cell.formatted)
    if (aliases.some((alias) => header.includes(normalizeHeader(alias)))) return column
  }
  return null
}

function rawText(grid: WorkbookGrid, row: number, column: number | null): string {
  if (column === null) return ''
  return displayExcelText(getGridCell(grid, row, column)?.value)
}

function parseDateCell(grid: WorkbookGrid, row: number, column: number | null) {
  if (column === null) return { date: null, raw: '' }
  const cell = getGridCell(grid, row, column)
  if (!cell) return { date: null, raw: '' }
  const direct = parseExcelDate(cell.value, cell.formatted)
  if (direct) return { date: direct, raw: '' }
  const raw = displayExcelText(cell.formatted || cell.value)
  const embedded = raw.match(/\d{1,4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,4}/)?.[0]
  return { date: embedded ? parseExcelDate(embedded) : null, raw }
}

export function parseBearingCountSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  fileName: string,
): SheetParseResult {
  const result = emptyResult()
  const grid = buildWorkbookGrid(sheet)
  const headerRow = findHeaderRow(grid, ['الصنف', 'العدد'])
  if (headerRow === null) {
    result.errors.push(`تعذر اكتشاف عمودي الصنف والعدد في الشيت "${sheetName}".`)
    return result
  }

  const itemColumn = findColumn(grid, headerRow, ['الصنف'])
  const quantityColumn = findColumn(grid, headerRow, ['العدد', 'الكمية'])
  if (itemColumn === null || quantityColumn === null) return result

  const aggregated = new Map<string, { itemName: string; quantity: number; row: number }>()
  for (const row of grid.rowNumbers.filter((value) => value > headerRow)) {
    const itemName = rawText(grid, row, itemColumn)
    const quantity = parseExcelNumber(getGridCell(grid, row, quantityColumn)?.value)
    if (!itemName) {
      result.skippedRows += 1
      continue
    }
    if (normalizeMatchText(itemName).includes(normalizeMatchText('اجمالى'))) {
      result.skippedRows += 1
      continue
    }
    if (quantity === null) {
      result.warnings.push(`${sheetName} - الصف ${row + 1}: تم تجاهل كمية غير رقمية للصنف "${itemName}".`)
      result.skippedRows += 1
      continue
    }

    const key = normalizeKeyPart(itemName)
    const existing = aggregated.get(key)
    if (existing) existing.quantity += quantity
    else aggregated.set(key, { itemName, quantity, row })
  }

  for (const entry of aggregated.values()) {
    const itemKey = buildItemKey({
      tableName: 'consumables',
      projectName: 'جرد البلى',
      itemName: entry.itemName,
    })
    result.items.push({
      table_name: 'consumables',
      item_key: itemKey,
      project_name: 'جرد البلى',
      item_name: entry.itemName,
      opening_balance: entry.quantity,
      total_added: entry.quantity,
      total_issued: 0,
      stock_balance: entry.quantity,
      transaction_date: '2026-07-31',
      source: { file_name: fileName, sheet: sheetName, row: entry.row + 1 },
      fields: {},
      notes: 'جرد البلى المجمع من ملف يوليو 2026',
    })
  }
  return result
}

export function parseCuttingDiscsSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  fileName: string,
): SheetParseResult {
  const result = emptyResult()
  const grid = buildWorkbookGrid(sheet)
  const headerRow = findHeaderRow(grid, ['type', 'تاريخ الاستلام'])
    ?? findHeaderRow(grid, ['النوع', 'تاريخ الاستلام'])
  if (headerRow === null) {
    result.errors.push(`تعذر اكتشاف أعمدة عهدة الصواريخ في الشيت "${sheetName}".`)
    return result
  }

  const codeColumn = findColumn(grid, headerRow, ['م', 'الكود', 'code'])
  const typeColumn = findColumn(grid, headerRow, ['type', 'النوع'])
  const receiverColumn = findColumn(grid, headerRow, ['اسم صاحب الصاروخ', 'المستلم', 'received by'])
  const receivedDateColumn = findColumn(grid, headerRow, ['تاريخ الاستلام', 'received date'])
  const scrappedDateColumn = findColumn(grid, headerRow, ['تكهين', 'تاريخ التكهين', 'scrapped'])
  if (typeColumn === null) return result

  const seen = new Set<string>()
  for (const row of grid.rowNumbers.filter((value) => value > headerRow)) {
    const code = rawText(grid, row, codeColumn) || null
    const typeName = rawText(grid, row, typeColumn)
    const receivedBy = rawText(grid, row, receiverColumn) || null
    const received = parseDateCell(grid, row, receivedDateColumn)
    const scrapped = parseDateCell(grid, row, scrappedDateColumn)
    if (!code && !typeName && !receivedBy && !received.raw && !scrapped.raw) {
      result.skippedRows += 1
      continue
    }
    if (!typeName) {
      result.warnings.push(`${sheetName} - الصف ${row + 1}: تم تجاهل سجل صاروخ بدون نوع.`)
      result.skippedRows += 1
      continue
    }

    const notes: string[] = []
    if (received.raw && !received.date) {
      notes.push(`تاريخ الاستلام الأصلي: ${received.raw}`)
      result.warnings.push(`${sheetName} - الصف ${row + 1}: تاريخ استلام اختياري غير صالح "${received.raw}".`)
    }
    if (scrapped.raw && !scrapped.date) {
      notes.push(`تاريخ التكهين الأصلي: ${scrapped.raw}`)
      result.warnings.push(`${sheetName} - الصف ${row + 1}: تاريخ تكهين اختياري غير صالح "${scrapped.raw}".`)
    }

    const identity = code
      ? `code:${normalizeKeyPart(code)}`
      : ['fallback', typeName, receivedBy, received.date, scrapped.date].map(normalizeKeyPart).join('|')
    if (seen.has(identity)) {
      result.warnings.push(`${sheetName} - الصف ${row + 1}: تم تجاهل سجل صاروخ مكرر.`)
      result.skippedRows += 1
      continue
    }
    seen.add(identity)

    const record: CustomCuttingDisc = {
      code,
      type_name: typeName,
      received_by: receivedBy,
      received_date: received.date,
      scrapped_date: scrapped.date,
      notes: notes.length ? notes.join(' | ') : null,
      source_file: fileName,
      source_sheet: sheetName,
      source_row: row + 1,
    }
    result.cuttingDiscs.push(record)
  }
  return result
}

export function parseWeldingGlovesSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  fileName: string,
): SheetParseResult {
  const result = emptyResult()
  const grid = buildWorkbookGrid(sheet)
  const headerRow = findHeaderRow(grid, ['الاسم', 'التاريخ'])
  if (headerRow === null) {
    result.errors.push(`تعذر اكتشاف أعمدة عهدة جوانتي اللحام في الشيت "${sheetName}".`)
    return result
  }

  const receiverColumn = findColumn(grid, headerRow, ['الاسم', 'المستلم'])
  if (receiverColumn === null) return result
  const headerColumns = [...(grid.rows.get(headerRow)?.keys() ?? [])].sort((left, right) => left - right)
  const dateColumns = headerColumns.filter((column) => normalizeHeader(getGridText(grid, headerRow, column)).includes(normalizeHeader('تاريخ')))
  const typeColumns = headerColumns.filter((column) => {
    const header = normalizeHeader(getGridText(grid, headerRow, column))
    return column !== receiverColumn && !header.includes(normalizeHeader('تاريخ')) && header !== normalizeHeader('الاسم')
  })
  const seen = new Set<string>()

  for (const row of grid.rowNumbers.filter((value) => value > headerRow)) {
    const receivedBy = rawText(grid, row, receiverColumn)
    if (!receivedBy) {
      result.skippedRows += 1
      continue
    }

    const parsedDates = dateColumns.map((column) => parseDateCell(grid, row, column))
    const validDates = parsedDates.flatMap((entry) => entry.date ? [entry.date] : [])
    const receivedDate = validDates.sort().at(-1) ?? null
    const invalidDates = parsedDates.flatMap((entry) => entry.raw && !entry.date ? [entry.raw] : [])
    if (invalidDates.length) {
      result.warnings.push(`${sheetName} - الصف ${row + 1}: تواريخ اختيارية غير صالحة: ${invalidDates.join('، ')}.`)
    }

    let recordsInRow = 0
    for (const column of typeColumns) {
      const cell = getGridCell(grid, row, column)
      if (!cell) continue
      const parsedQuantity = parseExcelNumber(cell.value)
      const quantity = parsedQuantity ?? (cell.formatted ? 1 : 0)
      if (quantity <= 0) continue
      const typeName = getGridText(grid, headerRow, column)
      if (!typeName) continue
      const identity = [typeName, receivedBy, receivedDate].map(normalizeKeyPart).join('|')
      if (seen.has(identity)) {
        result.warnings.push(`${sheetName} - الصف ${row + 1}: تم تجاهل سجل جوانتي مكرر.`)
        result.skippedRows += 1
        continue
      }
      seen.add(identity)
      const record: CustomWeldingGlove = {
        type_name: typeName,
        received_by: receivedBy,
        received_date: receivedDate,
        quantity,
        notes: invalidDates.length ? `التواريخ الأصلية غير الصالحة: ${invalidDates.join('، ')}` : null,
        source_file: fileName,
        source_sheet: sheetName,
        source_row: row + 1,
      }
      result.longWeldingGloves.push(record)
      recordsInRow += 1
    }
    if (recordsInRow === 0) result.skippedRows += 1
  }
  return result
}

function groupTypeName(grid: WorkbookGrid, row: number, start: number, end: number) {
  return [...new Set(
    Array.from({ length: end - start + 1 }, (_, offset) => getGridText(grid, row, start + offset))
      .filter(Boolean),
  )].join(' ')
}

export function parseCylinderSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  fileName: string,
  config: CustomSheetConfig,
): SheetParseResult {
  const result = emptyResult()
  const grid = buildWorkbookGrid(sheet)
  const subheaderRow = findHeaderRow(grid, ['ملي', 'فارغ', 'رصيد'])
    ?? findHeaderRow(grid, ['ملى', 'فارغ', 'رصيد'])
  if (subheaderRow === null) {
    result.errors.push(`تعذر اكتشاف مجموعات ملي/فارغ/رصيد في الشيت "${sheetName}".`)
    return result
  }
  const typeHeaderRow = Math.max(0, subheaderRow - 1)
  const dateColumn = findColumn(grid, subheaderRow, ['تاريخ', 'تاربخ']) ?? 0
  const columns = [...(grid.rows.get(subheaderRow)?.keys() ?? [])].sort((left, right) => left - right)
  const balanceColumns = columns.filter((column) => normalizeHeader(getGridText(grid, subheaderRow, column)) === normalizeHeader('رصيد'))

  for (const balanceColumn of balanceColumns) {
    const startColumn = Math.max(dateColumn + 1, balanceColumn - 2)
    const typeName = groupTypeName(grid, typeHeaderRow, startColumn, balanceColumn)
    if (!typeName) continue

    let openingBalance = 0
    let finalBalance: number | null = null
    let emptyCount: number | null = null
    let fullCount: number | null = null
    let sourceRow = subheaderRow + 1

    for (const row of grid.rowNumbers.filter((value) => value > subheaderRow)) {
      const dateCell = getGridCell(grid, row, dateColumn)
      const date = parseExcelDate(dateCell?.value, dateCell?.formatted)
      if (!date || date > '2026-07-31') continue
      const balance = parseExcelNumber(getGridCell(grid, row, balanceColumn)?.value)
      const full = parseExcelNumber(getGridCell(grid, row, startColumn)?.value)
      const empty = parseExcelNumber(getGridCell(grid, row, startColumn + 1)?.value)
      if (date === '2026-06-30' && balance !== null) openingBalance = balance
      if (balance !== null || full !== null || empty !== null) {
        if (balance !== null) finalBalance = balance
        if (full !== null) fullCount = full
        if (empty !== null) emptyCount = empty
        sourceRow = row + 1
      }
    }
    if (finalBalance === null) {
      result.skippedRows += 1
      continue
    }

    const projectName = config.defaultProject ?? 'اسطوانات غازات'
    const itemKey = buildItemKey({ tableName: 'cylinders', projectName, itemName: typeName, typeName })
    const item: CustomInventoryItem = {
      table_name: 'cylinders',
      item_key: itemKey,
      project_name: projectName,
      item_name: typeName,
      type_name: typeName,
      opening_balance: openingBalance,
      total_added: 0,
      total_issued: 0,
      stock_balance: finalBalance,
      transaction_date: '2026-07-31',
      source: { file_name: fileName, sheet: sheetName, row: sourceRow },
      fields: { empty_count: emptyCount, full_count: fullCount },
    }
    result.items.push(item)
  }
  return result
}
