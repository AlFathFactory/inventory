-- Synced stock-item tables. consumables/paints/screws/stock_screws/
-- raw_materials/inventory_items share the same base stock-item shape
-- (mirrors their Supabase tables column-for-column); cylinders and
-- inventory_items each carry a few table-specific fields.

CREATE TABLE IF NOT EXISTS consumables (
    id TEXT PRIMARY KEY NOT NULL,
    project TEXT,
    item_name TEXT,
    transaction_date TEXT,
    issued REAL,
    added REAL,
    total_added REAL,
    total_issued REAL,
    stock_balance REAL,
    min_quantity REAL,
    source_file TEXT,
    source_sheet TEXT,
    created_at TEXT,
    updated_at TEXT,
    item_key TEXT,
    is_archived INTEGER,
    merged_into_item_id TEXT,
    notes TEXT,
    opening_balance REAL,
    internal_code TEXT,
    supplier_name TEXT
);
CREATE INDEX IF NOT EXISTS consumables_updated_at_idx ON consumables (updated_at);

CREATE TABLE IF NOT EXISTS paints (
    id TEXT PRIMARY KEY NOT NULL,
    project TEXT,
    item_name TEXT,
    transaction_date TEXT,
    issued REAL,
    added REAL,
    total_added REAL,
    total_issued REAL,
    stock_balance REAL,
    min_quantity REAL,
    source_file TEXT,
    source_sheet TEXT,
    created_at TEXT,
    updated_at TEXT,
    item_key TEXT,
    is_archived INTEGER,
    merged_into_item_id TEXT,
    expire_date TEXT,
    notes TEXT,
    opening_balance REAL,
    internal_code TEXT,
    supplier_name TEXT,
    production_date TEXT
);
CREATE INDEX IF NOT EXISTS paints_updated_at_idx ON paints (updated_at);

CREATE TABLE IF NOT EXISTS screws (
    id TEXT PRIMARY KEY NOT NULL,
    project TEXT,
    item_name TEXT,
    din TEXT,
    code_number TEXT,
    transaction_date TEXT,
    issued REAL,
    added REAL,
    total_added REAL,
    total_issued REAL,
    stock_balance REAL,
    min_quantity REAL,
    source_file TEXT,
    source_sheet TEXT,
    created_at TEXT,
    updated_at TEXT,
    item_key TEXT,
    is_archived INTEGER,
    merged_into_item_id TEXT,
    notes TEXT,
    opening_balance REAL,
    internal_code TEXT,
    supplier_name TEXT
);
CREATE INDEX IF NOT EXISTS screws_updated_at_idx ON screws (updated_at);

CREATE TABLE IF NOT EXISTS stock_screws (
    id TEXT PRIMARY KEY NOT NULL,
    project TEXT,
    item_name TEXT,
    din TEXT,
    code_number TEXT,
    transaction_date TEXT,
    issued REAL,
    added REAL,
    total_added REAL,
    total_issued REAL,
    stock_balance REAL,
    min_quantity REAL,
    source_file TEXT,
    source_sheet TEXT,
    created_at TEXT,
    updated_at TEXT,
    item_key TEXT,
    is_archived INTEGER,
    merged_into_item_id TEXT,
    notes TEXT,
    opening_balance REAL,
    internal_code TEXT,
    supplier_name TEXT
);
CREATE INDEX IF NOT EXISTS stock_screws_updated_at_idx ON stock_screws (updated_at);

CREATE TABLE IF NOT EXISTS raw_materials (
    id TEXT PRIMARY KEY NOT NULL,
    project TEXT,
    item_name TEXT,
    transaction_date TEXT,
    issued REAL,
    added REAL,
    total_added REAL,
    total_issued REAL,
    stock_balance REAL,
    min_quantity REAL,
    source_file TEXT,
    source_sheet TEXT,
    created_at TEXT,
    updated_at TEXT,
    item_key TEXT,
    is_archived INTEGER,
    merged_into_item_id TEXT,
    weight REAL,
    length REAL,
    width REAL,
    th REAL,
    material_source TEXT,
    notes TEXT,
    opening_balance REAL,
    code_number TEXT,
    din TEXT,
    dimension_text TEXT,
    internal_code TEXT,
    supplier_name TEXT
);
CREATE INDEX IF NOT EXISTS raw_materials_updated_at_idx ON raw_materials (updated_at);

CREATE TABLE IF NOT EXISTS cylinders (
    id TEXT PRIMARY KEY NOT NULL,
    type_name TEXT,
    gas_balance REAL,
    empty_count REAL,
    full_count REAL,
    transaction_date TEXT,
    notes TEXT,
    source_file TEXT,
    source_sheet TEXT,
    created_at TEXT,
    updated_at TEXT,
    item_key TEXT,
    is_archived INTEGER,
    merged_into_item_id TEXT,
    project TEXT,
    stock_balance REAL,
    min_quantity REAL,
    internal_code TEXT,
    supplier_name TEXT
);
CREATE INDEX IF NOT EXISTS cylinders_updated_at_idx ON cylinders (updated_at);

CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT NOT NULL,
    project TEXT,
    item_name TEXT,
    transaction_date TEXT,
    issued REAL,
    added REAL,
    total_added REAL,
    total_issued REAL,
    stock_balance REAL,
    min_quantity REAL,
    source_file TEXT,
    source_sheet TEXT,
    created_at TEXT,
    updated_at TEXT,
    item_key TEXT,
    is_archived INTEGER,
    merged_into_item_id TEXT,
    notes TEXT,
    opening_balance REAL,
    internal_code TEXT,
    supplier_name TEXT
);
CREATE INDEX IF NOT EXISTS inventory_items_updated_at_idx ON inventory_items (updated_at);
