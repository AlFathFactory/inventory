-- Named parties referenced by inventory operations: departments/projects,
-- employees (issue recipients) and suppliers (addition sources).

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    status TEXT,
    notes TEXT,
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON projects (updated_at);

CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    employee_code TEXT,
    department TEXT,
    phone TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS employees_updated_at_idx ON employees (updated_at);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    supplier_code TEXT,
    phone TEXT,
    contact_person TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS suppliers_updated_at_idx ON suppliers (updated_at);
