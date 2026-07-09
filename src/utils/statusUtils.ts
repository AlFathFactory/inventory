import type { InventoryRow } from '../services/inventoryService'

export type StockStatus = 'out' | 'low' | 'safe'

function toComparableNumber(value: InventoryRow[string]): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalizedValue = Number(value)
    return Number.isFinite(normalizedValue) ? normalizedValue : null
  }

  return null
}

export function getStockStatus(
  row: InventoryRow,
  stockField: string,
  minQuantityField: string,
): StockStatus | null {
  const stockValue = toComparableNumber(row[stockField])
  const minQuantityValue = toComparableNumber(row[minQuantityField])

  if (stockValue === null || minQuantityValue === null) {
    return null
  }

  if (stockValue <= 0) {
    return 'out'
  }

  if (stockValue <= minQuantityValue) {
    return 'low'
  }

  return 'safe'
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
