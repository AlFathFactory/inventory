/** Mirrors the Supabase `employee_custody_items` table. */
export interface LocalEmployeeCustodyItem {
  id: string
  employee_id: string
  table_name: string
  item_id: string
  source_issue_operation_id: string | null
  quantity: number
  received_date: string | null
  scrapped_date: string | null
  scrap_reason: string | null
  notes: string | null
  created_by: string | null
  scrapped_by: string | null
  created_at: string | null
  updated_at: string | null
}
