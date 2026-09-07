-- Custody category tables (صواريخ / جوانتي لحام طويل).
--
-- Both mirror their Supabase tables column-for-column as returned by
-- `get_inventory_sync_delta_rpc` (which emits `to_jsonb(t)`, i.e. every
-- column). They are deliberately asymmetric, matching the live schema:
-- cutting_discs carries `code` and `scrapped_date` but has no archive flag;
-- long_welding_gloves carries `quantity` and `is_archived` but neither.
--
-- Added in v3 so the already-released v1/v2 migrations stay untouched.

CREATE TABLE IF NOT EXISTS cutting_discs (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT,
    type_name TEXT,
    received_by TEXT,
    received_date TEXT,
    scrapped_date TEXT,
    source_file TEXT,
    source_sheet TEXT,
    created_at TEXT,
    updated_at TEXT,
    notes TEXT,
    internal_code TEXT,
    supplier_name TEXT
);
CREATE INDEX IF NOT EXISTS cutting_discs_updated_at_idx ON cutting_discs (updated_at);
-- The category list is ordered by received_date.
CREATE INDEX IF NOT EXISTS cutting_discs_received_date_idx ON cutting_discs (received_date);

CREATE TABLE IF NOT EXISTS long_welding_gloves (
    id TEXT PRIMARY KEY NOT NULL,
    type_name TEXT,
    received_by TEXT,
    received_date TEXT,
    source_file TEXT,
    source_sheet TEXT,
    created_at TEXT,
    updated_at TEXT,
    quantity REAL,
    notes TEXT,
    is_archived INTEGER,
    internal_code TEXT,
    supplier_name TEXT
);
CREATE INDEX IF NOT EXISTS long_welding_gloves_updated_at_idx ON long_welding_gloves (updated_at);
CREATE INDEX IF NOT EXISTS long_welding_gloves_received_date_idx ON long_welding_gloves (received_date);
