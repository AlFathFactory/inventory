import type { InventoryRow } from '../services/inventoryService'

export type StockStatus = 'out' | 'low' | 'safe'

function toComparableNumber(value: InventoryRow[string] | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalizedValue = Number(value)
    return Number.isFinite(normalizedValue) ? normalizedValue : null
  }

  return null
}

export function getStockStatusFromValues(
  stockValue: InventoryRow[string] | undefined,
  minQuantityValue: InventoryRow[string] | undefined,
): StockStatus | null {
  const normalizedStockValue = toComparableNumber(stockValue)
  const normalizedMinQuantityValue = toComparableNumber(minQuantityValue)

  if (normalizedStockValue === null || normalizedMinQuantityValue === null) {
    return null
  }

  if (normalizedStockValue <= 0) {
    return 'out'
  }

  if (normalizedStockValue <= normalizedMinQuantityValue) {
    return 'low'
  }

  return 'safe'
}

export function getStockStatus(
  row: InventoryRow,
  stockField: string,
  minQuantityField: string,
): StockStatus | null {
  return getStockStatusFromValues(row[stockField], row[minQuantityField])
}

export function getStockStatusLabel(status: StockStatus): string {
  switch (status) {
    case 'out':
      return 'منتهي'
    case 'low':
      return 'قليل'
    case 'safe':
      return 'آمن'
  }
}

export function getStockStatusClass(status: StockStatus): string {
  switch (status) {
    case 'out':
      return 'bg-red-100 text-red-700'
    case 'low':
      return 'bg-amber-100 text-amber-700'
    case 'safe':
      return 'bg-emerald-100 text-emerald-700'
  }
}
