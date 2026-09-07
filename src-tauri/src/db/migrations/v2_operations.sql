-- Inventory movement ledger, per-employee allocations for group issues,
-- and a minimal tombstone table for deleted operations.

CREATE TABLE IF NOT EXISTS inventory_operations (
    id TEXT PRIMARY KEY NOT NULL,
    table_name TEXT NOT NULL,
    item_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    quantity REAL NOT NULL,
    project TEXT,
    project_id TEXT,
    category_label TEXT,
    item_label TEXT,
    previous_balance REAL,
    new_balance REAL,
    operation_date TEXT,
    notes TEXT,
    received_by TEXT,
    created_by TEXT,
    created_at TEXT,
    issue_code TEXT,
    project_name TEXT,
    item_name TEXT,
    issued_to TEXT,
    addition_code TEXT,
    item_code TEXT,
    supplier_name TEXT,
    purchase_order_number TEXT,
    category_name TEXT,
    source_category_row_id TEXT,
    source_table_name TEXT,
    source_row_type TEXT,
    import_id TEXT,
    import_key TEXT,
    related_operation_id TEXT,
    returned_quantity REAL NOT NULL DEFAULT 0,
    return_status TEXT NOT NULL DEFAULT 'not_returned',
    employee_id TEXT,
    supplier_id TEXT,
    request_id TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS inventory_operations_updated_at_idx ON inventory_operations (updated_at);
CREATE INDEX IF NOT EXISTS inventory_operations_item_idx ON inventory_operations (table_name, item_id);
CREATE INDEX IF NOT EXISTS inventory_operations_employee_idx ON inventory_operations (employee_id);

CREATE TABLE IF NOT EXISTS inventory_operation_employee_allocations (
    id TEXT PRIMARY KEY NOT NULL,
    issue_operation_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    employee_name_snapshot TEXT NOT NULL,
    allocated_quantity REAL,
    returned_quantity REAL NOT NULL DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS inventory_operation_employee_allocations_updated_at_idx
    ON inventory_operation_employee_allocations (updated_at);
CREATE INDEX IF NOT EXISTS inventory_operation_employee_allocations_issue_idx
    ON inventory_operation_employee_allocations (issue_operation_id);
CREATE INDEX IF NOT EXISTS inventory_operation_employee_allocations_employee_idx
    ON inventory_operation_employee_allocations (employee_id);

-- Tombstone: kept minimal, mirrors public.inventory_operation_deletions
-- exactly (no extra soft-delete columns on the live tables themselves).
CREATE TABLE IF NOT EXISTS inventory_operation_deletions (
    id TEXT PRIMARY KEY NOT NULL,
    operation_id TEXT NOT NULL,
    operation_snapshot TEXT,
    deleted_by TEXT,
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS inventory_operation_deletions_operation_idx
    ON inventory_operation_deletions (operation_id);
