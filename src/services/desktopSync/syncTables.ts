/**
 * Explicit column mapping for every synced table.
 *
 * Each list is the intersection of the local SQLite schema (migration v2)
 * and what `get_inventory_sync_delta_rpc` actually returns — so remote-only
 * columns (such as the generated `normalized_name` on parties) and
 * local-only columns are both left out deliberately.
 */
export const SYNC_TABLE_COLUMNS = {
  categories: [
    'id', 'name', 'slug', 'parent_id', 'is_archived', 'created_at', 'updated_at', 'code_prefix',
  ],
  consumables: [
    'id', 'project', 'item_name', 'transaction_date', 'issued', 'added', 'total_added',
    'total_issued', 'stock_balance', 'min_quantity', 'source_file', 'source_sheet',
    'created_at', 'updated_at', 'item_key', 'is_archived', 'merged_into_item_id', 'notes',
    'opening_balance', 'internal_code', 'supplier_name',
  ],
  paints: [
    'id', 'project', 'item_name', 'transaction_date', 'issued', 'added', 'total_added',
    'total_issued', 'stock_balance', 'min_quantity', 'source_file', 'source_sheet',
    'created_at', 'updated_at', 'item_key', 'is_archived', 'merged_into_item_id', 'notes',
    'opening_balance', 'internal_code', 'supplier_name', 'expire_date', 'production_date',
  ],
  screws: [
    'id', 'project', 'item_name', 'din', 'code_number', 'transaction_date', 'issued', 'added',
    'total_added', 'total_issued', 'stock_balance', 'min_quantity', 'source_file',
    'source_sheet', 'created_at', 'updated_at', 'item_key', 'is_archived',
    'merged_into_item_id', 'notes', 'opening_balance', 'internal_code', 'supplier_name',
  ],
  stock_screws: [
    'id', 'project', 'item_name', 'din', 'code_number', 'transaction_date', 'issued', 'added',
    'total_added', 'total_issued', 'stock_balance', 'min_quantity', 'source_file',
    'source_sheet', 'created_at', 'updated_at', 'item_key', 'is_archived',
    'merged_into_item_id', 'notes', 'opening_balance', 'internal_code', 'supplier_name',
  ],
  raw_materials: [
    'id', 'project', 'item_name', 'transaction_date', 'issued', 'added', 'total_added',
    'total_issued', 'stock_balance', 'min_quantity', 'source_file', 'source_sheet',
    'created_at', 'updated_at', 'item_key', 'is_archived', 'merged_into_item_id', 'weight',
    'length', 'width', 'th', 'material_source', 'notes', 'opening_balance', 'code_number',
    'din', 'dimension_text', 'internal_code', 'supplier_name',
  ],
  cylinders: [
    'id', 'type_name', 'gas_balance', 'empty_count', 'full_count', 'transaction_date', 'notes',
    'source_file', 'source_sheet', 'created_at', 'updated_at', 'item_key', 'is_archived',
    'merged_into_item_id', 'project', 'stock_balance', 'min_quantity', 'internal_code',
    'supplier_name',
  ],
  inventory_items: [
    'id', 'category_id', 'project', 'item_name', 'transaction_date', 'issued', 'added',
    'total_added', 'total_issued', 'stock_balance', 'min_quantity', 'source_file',
    'source_sheet', 'created_at', 'updated_at', 'item_key', 'is_archived',
    'merged_into_item_id', 'notes', 'opening_balance', 'internal_code', 'supplier_name',
  ],
  projects: ['id', 'name', 'code', 'status', 'notes', 'created_at', 'updated_at'],
  employees: [
    'id', 'name', 'employee_code', 'department', 'phone', 'notes', 'is_active',
    'created_at', 'updated_at',
  ],
  suppliers: [
    'id', 'name', 'supplier_code', 'phone', 'contact_person', 'notes', 'is_active',
    'created_at', 'updated_at',
  ],
  inventory_operations: [
    'id', 'table_name', 'item_id', 'operation_type', 'quantity', 'project', 'project_id',
    'category_label', 'item_label', 'previous_balance', 'new_balance', 'operation_date',
    'notes', 'received_by', 'created_by', 'created_at', 'issue_code', 'project_name',
    'item_name', 'issued_to', 'addition_code', 'item_code', 'supplier_name',
    'purchase_order_number', 'category_name', 'source_category_row_id', 'source_table_name',
    'source_row_type', 'import_id', 'import_key', 'related_operation_id', 'returned_quantity',
    'return_status', 'employee_id', 'supplier_id', 'request_id', 'updated_at',
  ],
  inventory_operation_employee_allocations: [
    'id', 'issue_operation_id', 'employee_id', 'employee_name_snapshot', 'allocated_quantity',
    'returned_quantity', 'created_at', 'updated_at',
  ],
  // The RPC returns only these three tombstone fields.
  inventory_operation_deletions: ['id', 'operation_id', 'deleted_at'],
  // The RPC omits created_by/scrapped_by, so they are not synced.
  employee_custody_items: [
    'id', 'employee_id', 'table_name', 'item_id', 'source_issue_operation_id', 'quantity',
    'received_date', 'scrapped_date', 'scrap_reason', 'notes', 'created_at', 'updated_at',
  ],
} as const satisfies Record<string, readonly string[]>

export type SyncTableName = keyof typeof SYNC_TABLE_COLUMNS

export const SYNC_TABLE_NAMES = Object.keys(SYNC_TABLE_COLUMNS) as SyncTableName[]

/** Tombstones are applied against this table, by `operation_id`. */
export const TOMBSTONE_TARGET_TABLE = 'inventory_operations'
