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
  item_name: string
  internal_code: string | null
  stock_balance: number
  min_quantity: number | null
  supplier_name: string | null
  is_archived: boolean
  created_at: string
}
