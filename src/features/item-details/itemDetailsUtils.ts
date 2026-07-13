import type { CategoryKey } from '../../config/categoryConfig'
import { categoryConfig } from '../../config/categoryConfig'
import { getNumericValue } from '../inventory-operations/operationForm'
import type { ItemMovement } from '../../services/itemsService'
import type { MonthlyMovementSummary } from './types'

export function isCategoryKey(value: string): value is CategoryKey {
  return value in categoryConfig
}

export function parseInventoryDate(value: string | null | undefined) {
  if (!value) return null

  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null

  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

export function getDateTimestamp(value: string) {
  return parseInventoryDate(value)?.getTime() ?? null
}

export function getInclusiveDateEndTimestamp(value: string) {
  const date = parseInventoryDate(value)
  if (!date) return null

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  ).getTime()
}

export function formatMovementDate(value: string | null | undefined) {
  const date = parseInventoryDate(value)
  if (!date) return value || '-'

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

export function buildMonthlyMovementSummaries(
  movements: ItemMovement[],
): MonthlyMovementSummary[] {
  const summaries = new Map<string, MonthlyMovementSummary>()

  movements.forEach((movement) => {
    const date = parseInventoryDate(movement.operation_date)
    if (!date) return

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const summary = summaries.get(monthKey) ?? {
      monthKey,
      monthLabel: new Intl.DateTimeFormat('ar-EG', {
        month: 'long',
        year: 'numeric',
      }).format(date),
      totalAdded: 0,
      totalIssued: 0,
    }

    summary.totalAdded += getNumericValue(movement.added_quantity)
    summary.totalIssued += getNumericValue(movement.issued_quantity)
    summaries.set(monthKey, summary)
  })

  return Array.from(summaries.values()).sort((a, b) =>
    b.monthKey.localeCompare(a.monthKey),
  )
}

export function getCounterpartyLabel(row: ItemMovement) {
  if (row.operation_type === 'add') return row.supplier_name
  if (row.operation_type === 'issue') return row.issued_to || row.received_by
  return row.received_by || row.issued_to || row.supplier_name
}

export function getOperationCode(row: ItemMovement) {
  if (row.operation_type === 'add') return row.addition_code
  if (row.operation_type === 'issue') return row.issue_code
  return row.addition_code || row.issue_code || row.item_code
}
