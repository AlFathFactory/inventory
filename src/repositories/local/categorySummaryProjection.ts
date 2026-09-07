import {
  mapCylinderSummaryItem,
  withComputedStockStatus,
  type CategorySummaryItem,
} from '../../services/itemsService'
import { asId, asNumber, asNumeric, asText, type LocalRow } from './rowValues'

/**
 * SQLite reproduction of `public.inventory_category_items_summary_view`
 * (which `inventory_item_details_view` also just re-selects).
 *
 * The web app reads that view, so the desktop app has to derive the same
 * columns — `category_name`, `status`, `source_rows_count`, `item_id` — from
 * the synced base tables instead of returning raw rows. Every branch below
 * mirrors one `UNION ALL` arm of the view; because the caller always filters
 * by table, only that arm is emitted rather than the whole union.
 *
 * Cylinders are deliberately absent: the web path reads the `cylinders` table
 * directly (the view projects a stale `min_quantity`) and maps it in TS, so
 * the desktop path reuses that same mapper.
 */

interface SummarySource {
  /** SQL expression producing the view's `category_name`. */
  categoryName: string
  /** FROM clause; the stock table is always aliased `t`. */
  from: string
  expireDate: string
  codeNumber: string
  din: string
  /** Only raw materials expose physical dimensions in the view. */
  materials: boolean
  /**
   * Columns the web path merges on top of the view row with a second query.
   * Locally they live on the same table, so they are selected inline.
   */
  extras: readonly string[]
}

const NONE = 'NULL'

const SUMMARY_SOURCES: Record<string, SummarySource> = {
  consumables: {
    categoryName: "'مستهلكات'",
    from: 'consumables t',
    expireDate: NONE,
    codeNumber: NONE,
    din: NONE,
    materials: false,
    extras: [],
  },
  paints: {
    categoryName: "'الدهانات'",
    from: 'paints t',
    expireDate: 't.expire_date',
    codeNumber: NONE,
    din: NONE,
    materials: false,
    extras: ['production_date'],
  },
  screws: {
    categoryName: "'مسامير'",
    from: 'screws t',
    expireDate: NONE,
    codeNumber: 't.code_number',
    din: 't.din',
    materials: false,
    extras: [],
  },
  stock_screws: {
    categoryName: "'مسامير استوك'",
    from: 'stock_screws t',
    expireDate: NONE,
    codeNumber: 't.code_number',
    din: 't.din',
    materials: false,
    extras: [],
  },
  raw_materials: {
    categoryName: "'خامات'",
    from: 'raw_materials t',
    expireDate: NONE,
    codeNumber: 't.code_number',
    din: 't.din',
    materials: true,
    extras: ['dimension_text'],
  },
  inventory_items: {
    categoryName: "COALESCE(cat.name, t.source_sheet, 'غير مصنف')",
    from: 'inventory_items t LEFT JOIN categories cat ON cat.id = t.category_id',
    expireDate: NONE,
    codeNumber: NONE,
    din: NONE,
    materials: false,
    extras: [],
  },
}

export const CYLINDERS_TABLE = 'cylinders'

export function hasCategorySummaryProjection(tableName: string): boolean {
  return tableName === CYLINDERS_TABLE || tableName in SUMMARY_SOURCES
}

function selectList(tableName: string, source: SummarySource): string {
  const dimension = (column: string) => (source.materials ? `t.${column}` : NONE)

  return [
    `'${tableName}' AS table_name`,
    `${source.categoryName} AS category_name`,
    't.id AS item_id',
    't.item_key AS item_key',
    't.project AS project_name',
    't.item_name AS item_name',
    't.stock_balance AS stock_balance',
    't.min_quantity AS min_quantity',
    // The view's own status expression: NULL balances collapse to "منتهي".
    `CASE
       WHEN COALESCE(t.stock_balance, 0) <= 0 THEN 'منتهي'
       WHEN COALESCE(t.stock_balance, 0) <= COALESCE(t.min_quantity, 0) THEN 'قليل'
       ELSE 'آمن'
     END AS status`,
    't.total_added AS total_added',
    't.total_issued AS total_issued',
    '1 AS source_rows_count',
    `${dimension('weight')} AS weight`,
    `${dimension('length')} AS length`,
    `${dimension('width')} AS width`,
    `${dimension('th')} AS th`,
    `${source.materials ? 't.material_source' : NONE} AS material_source`,
    `${source.expireDate} AS expire_date`,
    't.supplier_name AS supplier_name',
    't.notes AS notes',
    't.updated_at AS updated_at',
    't.created_at AS created_at',
    `${source.codeNumber} AS code_number`,
    `${source.din} AS din`,
    't.internal_code AS internal_code',
    ...source.extras.map((column) => `t.${column} AS ${column}`),
  ].join(',\n    ')
}

function requireSource(tableName: string): SummarySource {
  const source = SUMMARY_SOURCES[tableName]
  if (!source) {
    throw new Error(`لا يوجد ملخص أصناف محلي للجدول "${tableName}"`)
  }
  return source
}

/** Whole-category list, ordered the way the web query orders it. */
export function buildCategorySummarySql(tableName: string): string {
  const source = requireSource(tableName)
  return `SELECT
    ${selectList(tableName, source)}
  FROM ${source.from}
  WHERE COALESCE(t.is_archived, 0) = 0
  ORDER BY t.item_name, t.id`
}

/** Single item, resolved by primary key. */
export function buildItemDetailsSql(tableName: string): string {
  const source = requireSource(tableName)
  return `SELECT
    ${selectList(tableName, source)}
  FROM ${source.from}
  WHERE t.id = $1
  LIMIT 1`
}

/**
 * Field-by-field projection of a result row. Nothing is asserted: every value
 * is narrowed, so a column that is missing or of an unexpected type degrades
 * to null instead of lying about the row's shape.
 */
export function toCategorySummaryItem(
  row: LocalRow,
  tableName: string,
): CategorySummaryItem {
  const item: CategorySummaryItem = {
    table_name: tableName,
    category_name: asText(row.category_name) ?? '',
    item_id: asId(row.item_id),
    item_key: asText(row.item_key),
    project_name: asText(row.project_name),
    item_name: asText(row.item_name),
    stock_balance: asNumeric(row.stock_balance),
    min_quantity: asNumeric(row.min_quantity),
    status: asText(row.status),
    total_added: asNumeric(row.total_added),
    total_issued: asNumeric(row.total_issued),
    source_rows_count: asNumber(row.source_rows_count, 1),
    weight: asNumeric(row.weight),
    length: asNumeric(row.length),
    width: asNumeric(row.width),
    th: asNumeric(row.th),
    material_source: asText(row.material_source),
    expire_date: asText(row.expire_date),
    supplier_name: asText(row.supplier_name),
    notes: asText(row.notes),
    updated_at: asText(row.updated_at),
    created_at: asText(row.created_at),
    code_number: asText(row.code_number),
    din: asText(row.din),
    internal_code: asText(row.internal_code),
  }

  for (const column of requireSource(tableName).extras) {
    item[column] = asText(row[column])
  }

  // Same post-processing the web path applies on top of the view rows.
  return withComputedStockStatus(item)
}

/** `SELECT *` on the cylinders table, matching the web query's ordering. */
export const CYLINDER_LIST_SQL =
  'SELECT * FROM cylinders ORDER BY type_name, id'

export const CYLINDER_BY_ID_SQL = 'SELECT * FROM cylinders WHERE id = $1 LIMIT 1'

/** Narrows a raw cylinder row to the scalar record the shared mapper expects. */
export function toCylinderSummaryItem(row: LocalRow): CategorySummaryItem {
  const scalars: Record<string, string | number | null> = {}
  for (const [key, value] of Object.entries(row)) {
    scalars[key] =
      typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
        ? value
        : null
  }
  return mapCylinderSummaryItem(scalars)
}
