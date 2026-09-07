-- Category registry, mirrors public.categories.
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT,
    parent_id TEXT,
    is_archived INTEGER,
    created_at TEXT,
    updated_at TEXT,
    code_prefix TEXT
);
CREATE INDEX IF NOT EXISTS categories_updated_at_idx ON categories (updated_at);
