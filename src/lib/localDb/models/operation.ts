export type LocalOperationType = 'add' | 'issue' | 'adjust' | 'return'
export type LocalReturnStatus = 'not_returned' | 'partially_returned' | 'fully_returned'

/** Mirrors the Supabase `inventory_operations` table (the movement ledger). */
export interface LocalInventoryOperation {
  id: string
  table_name: string
  item_id: string
  operation_type: LocalOperationType
  quantity: number
  project: string | null
  project_id: string | null
  category_label: string | null
  item_label: string | null
  previous_balance: number | null
  new_balance: number | null
  operation_date: string | null
  notes: string | null
  received_by: string | null
  created_by: string | null
  created_at: string | null
  issue_code: string | null
  project_name: string | null
  item_name: string | null
  issued_to: string | null
  addition_code: string | null
  item_code: string | null
  supplier_name: string | null
  purchase_order_number: string | null
  category_name: string | null
  source_category_row_id: string | null
  source_table_name: string | null
  source_row_type: string | null
  import_id: string | null
  import_key: string | null
  related_operation_id: string | null
  returned_quantity: number
  return_status: LocalReturnStatus
  employee_id: string | null
  supplier_id: string | null
  request_id: string | null
  updated_at: string | null
}

/** Mirrors `inventory_operation_employee_allocations` (group-issue splits). */
export interface LocalInventoryOperationEmployeeAllocation {
  id: string
  issue_operation_id: string
  employee_id: string
  employee_name_snapshot: string
  allocated_quantity: number | null
  returned_quantity: number
  created_at: string | null
  updated_at: string | null
}

/** Mirrors `inventory_operation_deletions` — the deleted-operation tombstone. */
export interface LocalInventoryOperationDeletion {
  id: string
  operation_id: string
  /** JSON snapshot of the deleted operation row, stored as serialized text. */
  operation_snapshot: string | null
  deleted_by: string | null
  deleted_at: string | null
}
