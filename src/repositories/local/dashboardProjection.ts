import type { InventoryRow } from '../../services/inventoryService'
import { asId, asNumeric, asText, type LocalRow } from './rowValues'

/**
 * SQLite reproduction of `get_inventory_dashboard_summary_rpc`.
 *
 * The remote RPC returns one JSONB envelope; this builds the same envelope
 * from the synced local tables so the dashboard renders offline. The row
 * objects mirror the RPC's `jsonb_strip_nulls(jsonb_build_object(...))` per
 * table, so the existing `getDashboardData` transform consumes either source
 * unchanged and no mapping logic is duplicated.
 */

/** Tables the RPC counts for the legacy category cards (no archive filter). */
export const DASHBOARD_COUNT_TABLES = [
  'consumables',
  'paints',
  'screws',
  'stock_screws',
  'raw_materials',
] as const

/** Columns each table contributes to `inventory_rows`, mirroring the RPC. */
const ROW_COLUMNS: Record<string, readonly string[]> = {
  consumables: [
    'id', 'internal_code', 'item_name', 'project', 'transaction_date',
    'stock_balance', 'min_quantity', 'supplier_name', 'updated_at',
  ],
  paints: [
    'id', 'internal_code', 'item_name', 'project', 'transaction_date', 'expire_date',
    'stock_balance', 'min_quantity', 'supplier_name', 'updated_at',
  ],
  screws: [
    'id', 'internal_code', 'item_name', 'project', 'din', 'code_number',
    'transaction_date', 'stock_balance', 'min_quantity', 'supplier_name', 'updated_at',
  ],
  stock_screws: [
    'id', 'internal_code', 'item_name', 'project', 'din', 'code_number',
    'transaction_date', 'stock_balance', 'min_quantity', 'supplier_name', 'updated_at',
  ],
  raw_materials: [
    'id', 'internal_code', 'item_name', 'project', 'din', 'code_number',
    'material_source', 'weight', 'length', 'width', 'th', 'dimension_text',
    'transaction_date', 'stock_balance', 'min_quantity', 'supplier_name', 'updated_at',
  ],
}

/** Numeric columns, so they are narrowed as numerics rather than text. */
const NUMERIC_COLUMNS = new Set([
  'stock_balance', 'min_quantity', 'weight', 'length', 'width', 'th',
])

export function buildDashboardRowsSql(tableName: string): string {
  const columns = ROW_COLUMNS[tableName]
  if (!columns) throw new Error(`لا توجد لوحة تحكم محلية للجدول "${tableName}"`)
  return `SELECT ${columns.join(', ')} FROM ${tableName}`
}

export function buildDashboardCountSql(tableName: string): string {
  if (!ROW_COLUMNS[tableName]) throw new Error(`جدول غير معروف "${tableName}"`)
  return `SELECT COUNT(*) AS row_count FROM ${tableName}`
}

/** Dynamic items carry their resolved category, exactly like the RPC. */
export const DYNAMIC_ROWS_SQL = `
  SELECT i.id, i.internal_code, i.item_name, i.project, i.transaction_date,
         i.stock_balance, i.min_quantity, i.supplier_name, i.updated_at,
         i.category_id,
         COALESCE(cat.name, i.source_sheet, 'غير مصنف') AS category_name
  FROM inventory_items i
  LEFT JOIN categories cat ON cat.id = i.category_id
  WHERE COALESCE(i.is_archived, 0) = 0
`

export const DYNAMIC_CATEGORY_COUNTS_SQL = `
  SELECT cat.id AS category_id, cat.name AS category_name, COUNT(i.id) AS row_count
  FROM categories cat
  JOIN inventory_items i
    ON i.category_id = cat.id AND COALESCE(i.is_archived, 0) = 0
  GROUP BY cat.id, cat.name
  ORDER BY cat.name
`

/**
 * Mirrors `jsonb_strip_nulls`: keys whose value is null are dropped, so the
 * local rows have the same key set the remote rows do.
 */
function stripNulls(row: LocalRow, columns: readonly string[]): InventoryRow {
  const result: InventoryRow = {}
  for (const column of columns) {
    const value = column === 'id'
      ? asId(row[column])
      : NUMERIC_COLUMNS.has(column)
        ? asNumeric(row[column])
        : asText(row[column])
    if (value !== null && value !== '') result[column] = value
  }
  return result
}

export function toDashboardRow(row: LocalRow, tableName: string): InventoryRow {
  const columns = ROW_COLUMNS[tableName]
  if (!columns) throw new Error(`لا توجد لوحة تحكم محلية للجدول "${tableName}"`)
  return { ...stripNulls(row, columns), table_name: tableName }
}

const DYNAMIC_COLUMNS = [
  'id', 'internal_code', 'item_name', 'project', 'transaction_date',
  'stock_balance', 'min_quantity', 'supplier_name', 'updated_at',
  'category_id', 'category_name',
] as const

export function toDynamicDashboardRow(row: LocalRow): InventoryRow {
  return { ...stripNulls(row, DYNAMIC_COLUMNS), table_name: 'inventory_items' }
}

export function toDynamicCategoryCount(row: LocalRow) {
  return {
    category_id: String(asId(row.category_id)),
    category_name: asText(row.category_name) ?? '',
    row_count: Number(asNumeric(row.row_count) ?? 0),
  }
}
