export type DynamicCategory = {
  id: string
  name: string
  code_prefix: string
  item_count: number
  is_archived: boolean
  created_at: string
  updated_at: string | null
}

export type DynamicCategoryItem = {
  id: string
  category_id: string
  item_name: string
  internal_code: string | null
  project: string | null
  stock_balance: number
  min_quantity: number | null
  supplier_name: string | null
  opening_balance: number
  added: number
  issued: number
  total_added: number
  total_issued: number
  notes: string | null
  source_sheet: string | null
  is_archived: boolean
  transaction_date: string | null
  created_at: string
  updated_at: string | null
}

export type DynamicItemStockStatus = 'safe' | 'low' | 'out'
export type DynamicItemArchiveFilter = 'active' | 'archived' | 'all'
export type DynamicItemStatusFilter = DynamicItemStockStatus | 'all'
export type DynamicItemSort = 'name' | 'code' | 'balance' | 'updated'

export type DynamicItemFilters = {
  search: string
  archive: DynamicItemArchiveFilter
  status: DynamicItemStatusFilter
  sort: DynamicItemSort
}

export type DynamicItemCreateInput = {
  categoryId: string
  itemName: string
  openingBalance: number
  minQuantity: number
  supplierName: string
  notes: string
}

export type DynamicItemEditInput = {
  itemName: string
  project: string
  supplierName: string
  minQuantity: number
  notes: string
}

export type DynamicItemMovement = {
  id: string
  table_name: string
  item_id: string
  operation_type: string
  quantity: number
  operation_date: string
  previous_balance: number | null
  new_balance: number | null
  supplier_name: string | null
  issued_to: string | null
  received_by: string | null
  notes: string | null
  created_at: string
}
