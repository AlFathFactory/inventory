import * as XLSX from 'xlsx'
import { displayExcelText } from './normalization'

export type GridCell = {
  value: unknown
  formatted: string
}

export type WorkbookGrid = {
  rows: Map<number, Map<number, GridCell>>
  rowNumbers: number[]
  maxColumn: number
}

const MAX_MEANINGFUL_ROW = 20_000
const MAX_MEANINGFUL_COLUMN = 512

export function buildWorkbookGrid(sheet: XLSX.WorkSheet): WorkbookGrid {
  const rows = new Map<number, Map<number, GridCell>>()
  let maxColumn = 0

  for (const address of Object.keys(sheet)) {
    if (address.startsWith('!')) continue
    const decoded = XLSX.utils.decode_cell(address)
    if (decoded.r >= MAX_MEANINGFUL_ROW || decoded.c >= MAX_MEANINGFUL_COLUMN) continue

    const cell = sheet[address] as XLSX.CellObject | undefined
    if (!cell || cell.v === undefined || cell.v === null || displayExcelText(cell.v) === '') continue

    const row = rows.get(decoded.r) ?? new Map<number, GridCell>()
    row.set(decoded.c, { value: cell.v, formatted: displayExcelText(cell.w ?? cell.v) })
    rows.set(decoded.r, row)
    maxColumn = Math.max(maxColumn, decoded.c)
  }

  return {
    rows,
    rowNumbers: [...rows.keys()].sort((left, right) => left - right),
    maxColumn,
  }
}

export function getGridCell(grid: WorkbookGrid, row: number, column: number): GridCell | undefined {
  return grid.rows.get(row)?.get(column)
}

export function getGridText(grid: WorkbookGrid, row: number, column: number): string {
  return getGridCell(grid, row, column)?.formatted ?? ''
}
