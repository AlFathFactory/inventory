use tauri_plugin_sql::{Migration, MigrationKind};

/// The local SQLite database filename, resolved by the SQL plugin against
/// the app's data directory (no absolute path is ever hardcoded here).
pub const DATABASE_URL: &str = "sqlite:inventory.db";

/// Ordered schema migrations for the desktop-only local database.
/// Each entry runs exactly once, tracked by the plugin's own migrations table.
pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_metadata_table",
        sql: "CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );",
        kind: MigrationKind::Up,
    }]
}
