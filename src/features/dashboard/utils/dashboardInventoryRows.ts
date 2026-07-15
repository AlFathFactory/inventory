import type {
  CategoryDefinition,
  CategoryKey,
} from '../../../config/categoryConfig'
import type { InventoryRow } from '../../../services/inventoryService'
import { getStockStatus } from '../../../utils/statusUtils'
import type { DashboardInventoryRow } from '../types'

function extractStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function extractNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : null
  }

  return null
}

function extractItemId(row: InventoryRow, fallbackId: string): string {
  const value = row.id ?? row.item_id
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallbackId
}

function formatInventoryDate(value: unknown): string {
  const dateValue = extractStringValue(value)

  if (!dateValue) {
    return '—'
  }

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) {
    return dateValue
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  return `${day}/${month}/${year}`
}

function buildSearchText(
  category: CategoryDefinition,
  row: InventoryRow,
  itemName: string,
) {
  const universalSearchValues = [
    row.internal_code,
    row.item_name,
    row.project_name ?? row.project,
    row.material_source,
    row.code_number,
    row.din,
  ]
  const searchableValues = category.searchableFields
    .map((field) => row[field])
    .map((value) => {
      if (Array.isArray(value)) {
        return value.join(' ')
      }

      return String(value ?? '')
    })
    .join(' ')

  return [category.label, category.table, itemName, ...universalSearchValues, searchableValues]
    .join(' ')
    .toLowerCase()
}

export function buildDashboardInventoryRows(
  rowsByCategory: Array<{
    categoryKey: CategoryKey
    category: CategoryDefinition
    rows: InventoryRow[]
  }>,
): DashboardInventoryRow[] {
  return rowsByCategory
    .flatMap(({ categoryKey, category, rows }) =>
      rows.map((row, index) => {
        const fallbackId = `${category.table}-row-${index}`
        const itemId = extractItemId(row, fallbackId)
        const itemName =
          extractStringValue(row.item_name) ??
          extractStringValue(row.type_name) ??
          extractStringValue(row.code) ??
          'عنصر غير مسمى'

        const dateValue = extractStringValue(row[category.dateField])
        const stockBalance = category.stockField
          ? extractNumberValue(row[category.stockField])
          : null
        const minQuantity = category.minQuantityField
          ? extractNumberValue(row[category.minQuantityField])
          : null

        return {
          id: `${category.table}-${itemId}`,
          itemId,
          internalCode: extractStringValue(row.internal_code),
          categoryKey,
          categoryLabel: category.label,
          itemName,
          projectName: extractStringValue(row.project) ?? extractStringValue(row.received_by),
          dateValue,
          dateLabel: formatInventoryDate(row[category.dateField]),
          addedQuantity: extractNumberValue(row.added),
          issuedQuantity: extractNumberValue(row.issued),
          stockBalance,
          minQuantity,
          status:
            category.stockField && category.minQuantityField
              ? getStockStatus(row, category.stockField, category.minQuantityField)
              : null,
          searchText: buildSearchText(category, row, itemName),
        }
      }),
    )
    .sort((first, second) => {
      const firstTimestamp = first.dateValue ? new Date(first.dateValue).getTime() : 0
      const secondTimestamp = second.dateValue ? new Date(second.dateValue).getTime() : 0

      return secondTimestamp - firstTimestamp
    })
}

export function getInventoryRowDateTimestamp(dateValue: string | null) {
  if (!dateValue) {
    return 0
  }

  const timestamp = new Date(dateValue).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}
