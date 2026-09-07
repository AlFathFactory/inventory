/**
 * Shared shape of the "standard stock item" tables — consumables, paints,
 * screws, stock_screws, raw_materials and inventory_items all mirror this
 * column set in Supabase; each interface below adds only its own extras.
 */
export interface LocalStockItemBase {
  id: string
  project: string | null
  item_name: string | null
  transaction_date: string | null
  issued: number | null
  added: number | null
  total_added: number | null
  total_issued: number | null
  stock_balance: number | null
  min_quantity: number | null
  source_file: string | null
  source_sheet: string | null
  created_at: string | null
  updated_at: string | null
  item_key: string | null
  is_archived: number | null
  merged_into_item_id: string | null
  notes: string | null
  opening_balance: number | null
  internal_code: string | null
  supplier_name: string | null
}

export type LocalConsumable = LocalStockItemBase

export interface LocalPaint extends LocalStockItemBase {
  expire_date: string | null
  production_date: string | null
}

export interface LocalScrew extends LocalStockItemBase {
  din: string | null
  code_number: string | null
}

export type LocalStockScrew = LocalScrew

export interface LocalRawMaterial extends LocalStockItemBase {
  weight: number | null
  length: number | null
  width: number | null
  th: number | null
  material_source: string | null
  code_number: string | null
  din: string | null
  dimension_text: string | null
}

/** Cylinders track gas/empty/full counts instead of the generic item shape. */
export interface LocalCylinder {
  id: string
  type_name: string | null
  gas_balance: number | null
  empty_count: number | null
  full_count: number | null
  transaction_date: string | null
  notes: string | null
  source_file: string | null
  source_sheet: string | null
  created_at: string | null
  updated_at: string | null
  item_key: string | null
  is_archived: number | null
  merged_into_item_id: string | null
  project: string | null
  stock_balance: number | null
  min_quantity: number | null
  internal_code: string | null
  supplier_name: string | null
}

/** Dynamic-category item, linked to `categories` via `category_id`. */
export interface LocalInventoryItem extends LocalStockItemBase {
  category_id: string
}
