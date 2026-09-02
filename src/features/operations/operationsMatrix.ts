import type { InventoryOperationsGridMovement } from '../../services/operationsService'
import { includesSearchTerm, normalizeSearchTerm } from '../../utils/searchUtils'

export type MatrixOperationType = 'add' | 'issue'

export type MatrixScrewFilters = {
  din: string
  codeNumber: string
}

export type MatrixFrozenColumn = {
  key:
    | 'project'
    | 'item'
    | 'din'
    | 'codeNumber'
    | 'length'
    | 'width'
    | 'dimension'
    | 'weight'
    | 'balance'
  label: string
  width: number
}

const defaultFrozenColumns: readonly MatrixFrozenColumn[] = [
  { key: 'item', label: 'الصنف', width: 270 },
  { key: 'balance', label: 'الرصيد', width: 120 },
]

const screwFrozenColumns: readonly MatrixFrozenColumn[] = [
  { key: 'project', label: 'القسم', width: 180 },
  { key: 'item', label: 'الصنف', width: 270 },
  { key: 'din', label: 'DIN', width: 120 },
  { key: 'codeNumber', label: 'رقم الكود', width: 150 },
  { key: 'balance', label: 'الرصيد', width: 120 },
]

const rawMaterialFrozenColumns: readonly MatrixFrozenColumn[] = [
  { key: 'codeNumber', label: 'رقم الكود', width: 130 },
  { key: 'item', label: 'صنف', width: 220 },
  { key: 'length', label: 'LENGTH', width: 120 },
  { key: 'width', label: 'WIDTH', width: 120 },
  { key: 'dimension', label: 'السُمك / الأبعاد', width: 160 },
  { key: 'weight', label: 'وزن', width: 120 },
  { key: 'balance', label: 'الرصيد', width: 120 },
]

export function getOperationsMatrixFrozenColumns(
  showScrewDetails: boolean,
  showRawMaterialDetails = false,
) {
  if (showRawMaterialDetails) return rawMaterialFrozenColumns
  return showScrewDetails ? screwFrozenColumns : defaultFrozenColumns
}

export function matchesMatrixScrewFilters(
  din: string | null,
  codeNumber: string | null,
  filters: MatrixScrewFilters,
) {
  return (
    includesSearchTerm(din, normalizeSearchTerm(filters.din)) &&
    includesSearchTerm(codeNumber, normalizeSearchTerm(filters.codeNumber))
  )
}

function toLocalDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getMonthValue(dateValue: string) {
  return dateValue.slice(0, 7)
}

export function getOperationsDisplayDates(
  monthValue: string,
) {
  const [year, month] = monthValue.split('-').map(Number)
  if (!year || !month || month < 1 || month > 12) return []

  const lastDayOfMonth = new Date(year, month, 0).getDate()
  return Array.from({ length: lastDayOfMonth }, (_, index) =>
    toLocalDateValue(new Date(year, month - 1, index + 1)),
  )
}

export function getMovementCellKey(
  tableName: string,
  itemId: string | number,
  operationDate: string,
  operationType: MatrixOperationType,
) {
  return `${tableName}:${String(itemId)}:${operationDate}:${operationType}`
}

export function buildMovementTotals(
  movements: readonly InventoryOperationsGridMovement[],
) {
  const totals = new Map<string, number>()

  movements.forEach((movement) => {
    if (movement.operationType !== 'add' && movement.operationType !== 'issue') {
      return
    }

    const key = getMovementCellKey(
      movement.tableName,
      movement.itemId,
      movement.operationDate,
      movement.operationType,
    )
    totals.set(key, (totals.get(key) ?? 0) + movement.quantity)
  })

  return totals
}

export function getMatrixCellTotal(
  totals: ReadonlyMap<string, number>,
  tableName: string,
  itemId: string | number,
  operationDate: string,
  operationType: MatrixOperationType,
) {
  return totals.get(
    getMovementCellKey(tableName, itemId, operationDate, operationType),
  ) ?? 0
}
