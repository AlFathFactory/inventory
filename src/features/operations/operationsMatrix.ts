import type { InventoryOperationsGridMovement } from '../../services/operationsService'

export type OperationsRangeMode = 'five-days' | 'full-month'
export type MatrixOperationType = 'add' | 'issue'

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
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
  rangeMode: OperationsRangeMode,
  todayValue: string,
) {
  const [year, month] = monthValue.split('-').map(Number)
  if (!year || !month || month < 1 || month > 12) return []

  const lastDayOfMonth = new Date(year, month, 0).getDate()
  const todayMonth = getMonthValue(todayValue)
  const endDay = rangeMode === 'full-month'
    ? lastDayOfMonth
    : monthValue === todayMonth
      ? Math.min(parseLocalDate(todayValue).getDate(), lastDayOfMonth)
      : lastDayOfMonth
  const numberOfDays = rangeMode === 'full-month'
    ? lastDayOfMonth
    : Math.min(5, endDay)

  return Array.from({ length: numberOfDays }, (_, index) =>
    toLocalDateValue(new Date(year, month - 1, endDay - index)),
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
