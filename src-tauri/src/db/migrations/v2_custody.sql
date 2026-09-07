-- Items an employee currently (or previously) holds in custody.
CREATE TABLE IF NOT EXISTS employee_custody_items (
    id TEXT PRIMARY KEY NOT NULL,
    employee_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    item_id TEXT NOT NULL,
    source_issue_operation_id TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    received_date TEXT,
    scrapped_date TEXT,
    scrap_reason TEXT,
    notes TEXT,
    created_by TEXT,
    scrapped_by TEXT,
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS employee_custody_items_updated_at_idx ON employee_custody_items (updated_at);
CREATE INDEX IF NOT EXISTS employee_custody_items_employee_idx ON employee_custody_items (employee_id);
CREATE INDEX IF NOT EXISTS employee_custody_items_item_idx ON employee_custody_items (table_name, item_id);
CREATE INDEX IF NOT EXISTS employee_custody_items_issue_operation_idx
    ON employee_custody_items (source_issue_operation_id);
