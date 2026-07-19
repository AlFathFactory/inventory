import {
  categoryEntries,
  type CategoryDefinition,
  type CategoryKey,
} from '../../../config/categoryConfig'
import type { InventoryRow } from '../../../services/inventoryService'
import { getExpiryAlertStatus } from '../../../utils/expiryStatus'
import { getStockStatusFromValues } from '../../../utils/statusUtils'
import type { AlertStatus, LowStockRow } from '../types'

export type StockCategoryDefinition = CategoryDefinition & {
  stockField: string
  minQuantityField: string
}

export function hasStockConfig(category: CategoryDefinition): category is StockCategoryDefinition {
  return Boolean(category.stockField && category.minQuantityField)
}

export function hasOnlyStockField(
  category: CategoryDefinition,
): category is CategoryDefinition & { stockField: string } {
  return Boolean(category.stockField) && !category.minQuantityField
}

export function extractStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function extractNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const normalizedValue = Number(value)
    return Number.isFinite(normalizedValue) ? normalizedValue : null
  }
  return null
}

export function formatInventoryDate(value: unknown): string {
  const dateValue = extractStringValue(value)
  if (!dateValue) return '—'
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return dateValue
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

export function formatNumber(value: number | null) {
  return value === null ? '—' : value.toLocaleString()
}

function getItemName(row: InventoryRow): string {
  return extractStringValue(row.item_name) ?? extractStringValue(row.type_name) ?? extractStringValue(row.code) ?? 'عنصر غير مسمى'
}

function buildSearchText(category: CategoryDefinition, row: InventoryRow, itemName: string) {
  const universalSearchValues = [row.internal_code, row.item_name, row.project_name ?? row.project, row.material_source, row.supplier_name, row.code_number, row.din]
  const searchableValues = category.searchableFields.map((field) => row[field]).map((value) => Array.isArray(value) ? value.join(' ') : String(value ?? '')).join(' ')
  return [category.label, category.table, itemName, ...universalSearchValues, searchableValues].join(' ').toLowerCase()
}

export function mapLowStockRows(categoryKey: CategoryKey, category: CategoryDefinition, rows: InventoryRow[]): LowStockRow[] {
  return rows.flatMap((row, index) => {
    const itemName = getItemName(row)
    const stockBalance = category.stockField ? extractNumberValue(row[category.stockField]) : null
    const minQuantity = category.minQuantityField ? extractNumberValue(row[category.minQuantityField]) : null
    const status = getStockStatusFromValues(stockBalance, minQuantity)
    if (status === null || status === 'safe') return []
    return [{ id: `${category.table}-low-${index}`, categoryKey, categoryLabel: category.label, itemName, projectName: extractStringValue(row.project) ?? extractStringValue(row.received_by), dateValue: extractStringValue(row[category.dateField]), dateLabel: formatInventoryDate(row[category.dateField]), expiryDateLabel: '—', stockBalance, minQuantity, status, searchText: buildSearchText(category, row, itemName) }]
  })
}

export function mapOutOfStockRows(categoryKey: CategoryKey, category: CategoryDefinition & { stockField: string }, rows: InventoryRow[]): LowStockRow[] {
  return rows.map((row, index) => {
    const itemName = getItemName(row)
    return { id: `${category.table}-out-${index}`, categoryKey, categoryLabel: category.label, itemName, projectName: extractStringValue(row.project) ?? extractStringValue(row.received_by), dateValue: extractStringValue(row[category.dateField]), dateLabel: formatInventoryDate(row[category.dateField]), expiryDateLabel: '—', stockBalance: extractNumberValue(row[category.stockField]), minQuantity: null, status: 'out', searchText: buildSearchText(category, row, itemName) }
  })
}

export function mapExpiryRows(rows: InventoryRow[]): LowStockRow[] {
  const category = categoryEntries.find(([key]) => key === 'paints')?.[1]
  if (!category) return []
  return rows.flatMap((row, index) => {
    const expireDate = extractStringValue(row.expire_date)
    const status = expireDate ? getExpiryAlertStatus(expireDate) : null
    if (!status) return []
    const itemName = getItemName(row)
    return [{ id: `${category.table}-${status}-${index}`, categoryKey: 'paints', categoryLabel: category.label, itemName, projectName: extractStringValue(row.project), dateValue: extractStringValue(row[category.dateField]), dateLabel: formatInventoryDate(row[category.dateField]), expiryDateLabel: formatInventoryDate(expireDate), stockBalance: category.stockField ? extractNumberValue(row[category.stockField]) : null, minQuantity: category.minQuantityField ? extractNumberValue(row[category.minQuantityField]) : null, status, searchText: `${buildSearchText(category, row, itemName)} ${expireDate}` }]
  })
}

export function getAlertStatusLabel(status: AlertStatus): string {
  return { out: 'كمية فارغة', low: 'كمية قليلة', expiring: 'تنتهي خلال شهر', expired: 'منتهي الصلاحية' }[status]
}

export function getAlertStatusClass(status: AlertStatus): string {
  return { out: 'bg-red-100 text-red-700', expired: 'bg-red-100 text-red-700', low: 'bg-amber-100 text-amber-700', expiring: 'bg-orange-100 text-orange-700' }[status]
}
