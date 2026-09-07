import type { CategorySummaryItem, CustodyRecord } from '../../services/itemsService'
import { asId, asNumeric, asText, type LocalRow } from './rowValues'

/**
 * SQLite reads for the two custody category tables.
 *
 * These have no Postgres summary view behind them: the web pages read the
 * tables directly and map them in TS, so the desktop path reproduces those
 * two mappers rather than the summary projection. The shapes are genuinely
 * different from each other — `mapCuttingDiscRows` spreads the whole row
 * (keeping `code`, `scrapped_date`, `source_*` and real timestamps), while
 * `mapGloveRows` picks a fixed field list and nulls the timestamps — so both
 * are reproduced field-for-field instead of being merged.
 */

export const CUTTING_DISCS_TABLE = 'cutting_discs'
export const LONG_WELDING_GLOVES_TABLE = 'long_welding_gloves'

export type CustodyCategoryTable =
  | typeof CUTTING_DISCS_TABLE
  | typeof LONG_WELDING_GLOVES_TABLE

export function isCustodyCategoryTable(
  tableName: string,
): tableName is CustodyCategoryTable {
  return tableName === CUTTING_DISCS_TABLE || tableName === LONG_WELDING_GLOVES_TABLE
}

/**
 * `listCuttingDiscs()` orders by received_date descending and applies no
 * archive filter — the table has no archive flag.
 */
export const CUTTING_DISCS_LIST_SQL =
  'SELECT * FROM cutting_discs ORDER BY received_date DESC'

/** `listLongWeldingGloves()` filters `is_archived = false` first. */
export const LONG_WELDING_GLOVES_LIST_SQL =
  'SELECT * FROM long_welding_gloves WHERE COALESCE(is_archived, 0) = 0 ORDER BY received_date DESC'

export function buildCustodyCategoryListSql(tableName: CustodyCategoryTable): string {
  return tableName === CUTTING_DISCS_TABLE
    ? CUTTING_DISCS_LIST_SQL
    : LONG_WELDING_GLOVES_LIST_SQL
}

export function buildCustodyRecordSql(tableName: CustodyCategoryTable): string {
  return `SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1`
}

const CATEGORY_NAMES: Record<CustodyCategoryTable, string> = {
  [CUTTING_DISCS_TABLE]: 'صواريخ',
  [LONG_WELDING_GLOVES_TABLE]: 'جوانتي لحام طويل',
}

/** The nulled derived fields both web mappers set identically. */
function emptyStockFields() {
  return {
    item_key: null,
    project_name: null,
    stock_balance: null,
    min_quantity: null,
    status: null,
    total_added: null,
    total_issued: null,
    source_rows_count: 1,
  } as const
}

/** Reproduces `mapCuttingDiscRows`: the full row plus the derived fields. */
export function toCuttingDiscSummaryItem(row: LocalRow): CategorySummaryItem {
  return {
    id: asId(row.id),
    code: asText(row.code),
    type_name: asText(row.type_name),
    received_by: asText(row.received_by),
    received_date: asText(row.received_date),
    scrapped_date: asText(row.scrapped_date),
    source_file: asText(row.source_file),
    source_sheet: asText(row.source_sheet),
    notes: asText(row.notes),
    internal_code: asText(row.internal_code),
    supplier_name: asText(row.supplier_name),
    // The web mapper spreads the row, so these keep their real values here.
    created_at: asText(row.created_at),
    updated_at: asText(row.updated_at),
    table_name: CUTTING_DISCS_TABLE,
    category_name: CATEGORY_NAMES[CUTTING_DISCS_TABLE],
    item_id: asId(row.id),
    item_name: asText(row.type_name),
    ...emptyStockFields(),
  }
}

/**
 * Reproduces `mapGloveRows`: a fixed field list, with the timestamps
 * deliberately nulled the way the web mapper nulls them.
 */
export function toLongWeldingGloveSummaryItem(row: LocalRow): CategorySummaryItem {
  return {
    id: asId(row.id),
    internal_code: asText(row.internal_code),
    supplier_name: asText(row.supplier_name),
    type_name: asText(row.type_name),
    received_by: asText(row.received_by),
    received_date: asText(row.received_date),
    notes: asText(row.notes),
    table_name: LONG_WELDING_GLOVES_TABLE,
    category_name: CATEGORY_NAMES[LONG_WELDING_GLOVES_TABLE],
    item_id: asId(row.id),
    item_name: asText(row.type_name),
    ...emptyStockFields(),
    updated_at: null,
    created_at: null,
  }
}

export function toCustodyCategorySummaryItem(
  row: LocalRow,
  tableName: CustodyCategoryTable,
): CategorySummaryItem {
  return tableName === CUTTING_DISCS_TABLE
    ? toCuttingDiscSummaryItem(row)
    : toLongWeldingGloveSummaryItem(row)
}

/**
 * Reproduces `getCustodyRecord`, which returns the raw row untouched — so
 * every stored column is narrowed and passed through, with no derived fields.
 */
export function toCustodyRecord(
  row: LocalRow,
  tableName: CustodyCategoryTable,
): CustodyRecord {
  const base = {
    id: asId(row.id),
    type_name: asText(row.type_name),
    received_by: asText(row.received_by),
    received_date: asText(row.received_date),
    source_file: asText(row.source_file),
    source_sheet: asText(row.source_sheet),
    created_at: asText(row.created_at),
    updated_at: asText(row.updated_at),
    notes: asText(row.notes),
    internal_code: asText(row.internal_code),
    supplier_name: asText(row.supplier_name),
  }

  return tableName === CUTTING_DISCS_TABLE
    ? { ...base, code: asText(row.code), scrapped_date: asText(row.scrapped_date) }
    : {
        ...base,
        quantity: asNumeric(row.quantity),
        is_archived: asNumeric(row.is_archived),
      }
}
