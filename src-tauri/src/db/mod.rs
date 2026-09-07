use tauri_plugin_sql::{Migration, MigrationKind};

/// The local SQLite database filename, resolved by the SQL plugin against
/// the app's data directory (no absolute path is ever hardcoded here).
pub const DATABASE_URL: &str = "sqlite:inventory.db";

/// Ordered schema migrations for the desktop-only local database.
/// Each entry runs exactly once, tracked by the plugin's own migrations table.
/// SQL lives in `db/migrations/*.sql`, split by domain for readability —
/// this function only wires the files to their migration version.
pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_metadata_table",
            sql: include_str!("migrations/v1_metadata.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_synced_inventory_schema",
            sql: concat!(
                include_str!("migrations/v2_categories.sql"),
                include_str!("migrations/v2_stock_items.sql"),
                include_str!("migrations/v2_parties.sql"),
                include_str!("migrations/v2_operations.sql"),
                include_str!("migrations/v2_custody.sql"),
            ),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    const SYNCED_TABLES: [&str; 15] = [
        "categories",
        "consumables",
        "paints",
        "screws",
        "stock_screws",
        "raw_materials",
        "cylinders",
        "inventory_items",
        "projects",
        "employees",
        "suppliers",
        "inventory_operations",
        "inventory_operation_employee_allocations",
        "inventory_operation_deletions",
        "employee_custody_items",
    ];

    const REQUIRED_INDEX_COLUMNS: [&str; 6] = [
        "updated_at",
        "item_id",
        "table_name",
        "employee_id",
        "operation_id",
        "issue_operation_id",
    ];

    #[test]
    fn versions_are_ordered_and_unique() {
        let versions: Vec<i64> = migrations().iter().map(|m| m.version).collect();
        assert_eq!(versions, vec![1, 2]);
    }

    #[test]
    fn v2_creates_every_synced_table_with_a_text_primary_key() {
        let v2 = &migrations()[1];
        for table in SYNCED_TABLES {
            let needle = format!("CREATE TABLE IF NOT EXISTS {table} (\n    id TEXT PRIMARY KEY NOT NULL,");
            assert!(
                v2.sql.contains(&needle),
                "expected migration v2 to create `{table}` with a TEXT primary key `id`"
            );
        }
    }

    #[test]
    fn v2_indexes_cover_every_required_lookup_column() {
        let v2 = &migrations()[1];
        // Concatenate just the column-list portion of every CREATE INDEX
        // statement, then check each required column shows up as a whole
        // word — robust to standalone `(col)` vs composite `(a, col)` forms.
        let index_statements: String = v2
            .sql
            .split("CREATE INDEX")
            .skip(1)
            .map(|chunk| chunk.split(';').next().unwrap_or(""))
            .collect::<Vec<_>>()
            .join(" ");

        for column in REQUIRED_INDEX_COLUMNS {
            let is_covered = index_statements
                .split(|c: char| !c.is_alphanumeric() && c != '_')
                .any(|word| word == column);
            assert!(
                is_covered,
                "expected at least one index covering `{column}` in migration v2"
            );
        }
    }
}
