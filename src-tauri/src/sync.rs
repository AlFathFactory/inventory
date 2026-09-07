//! Rust-owned SQLite transaction boundary for desktop sync.
//!
//! The SQL plugin executes each JS statement against a pooled connection, so
//! a `BEGIN`/`COMMIT` pair issued from JavaScript is not guaranteed to run on
//! one connection. This command takes a single connection for the whole
//! write instead: everything commits together or not at all, and concurrent
//! readers keep seeing the previous snapshot until the commit lands.
//!
//! JavaScript sends a structured plan, never SQL. Table names are checked
//! against an allowlist and every identifier must be a plain lowercase
//! identifier, so no statement text can be injected from the frontend.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Sqlite, Transaction};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_sql::{DbInstances, DbPool};

/// Conservative cap on bind parameters per statement.
const MAX_BIND_PARAMS: usize = 900;

/// Tables the sync pipeline may write. Anything else is rejected.
const ALLOWED_TABLES: [&str; 15] = [
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

/// Tombstones remove rows from this table only.
const TOMBSTONE_TARGET_TABLE: &str = "inventory_operations";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncUpsert {
    pub table: String,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Value>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncWritePlan {
    pub upserts: Vec<SyncUpsert>,
    #[serde(default)]
    pub deleted_operation_ids: Vec<String>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncApplyReport {
    pub upserted_rows: usize,
    pub deleted_rows: usize,
}

/// Owned form of a JSON value, ready to bind to SQLite.
enum Bound {
    Null,
    Int(i64),
    Real(f64),
    Text(String),
}

fn to_bound(value: &Value) -> Bound {
    match value {
        Value::Null => Bound::Null,
        Value::Bool(flag) => Bound::Int(i64::from(*flag)),
        Value::Number(number) => number
            .as_i64()
            .map(Bound::Int)
            .or_else(|| number.as_f64().map(Bound::Real))
            .unwrap_or(Bound::Null),
        Value::String(text) => Bound::Text(text.clone()),
        other => Bound::Text(other.to_string()),
    }
}

fn is_safe_identifier(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
        && name
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c == '_')
}

fn validate_upsert(upsert: &SyncUpsert) -> Result<(), String> {
    if !ALLOWED_TABLES.contains(&upsert.table.as_str()) {
        return Err(format!("table `{}` is not syncable", upsert.table));
    }
    if upsert.columns.is_empty() {
        return Err(format!("table `{}` has no columns", upsert.table));
    }
    if !upsert.columns.iter().any(|column| column == "id") {
        return Err(format!("table `{}` must include an id column", upsert.table));
    }
    for column in &upsert.columns {
        if !is_safe_identifier(column) {
            return Err(format!(
                "column `{}` on table `{}` is not a valid identifier",
                column, upsert.table
            ));
        }
    }
    for (index, row) in upsert.rows.iter().enumerate() {
        if row.len() != upsert.columns.len() {
            return Err(format!(
                "row {} of table `{}` has {} values but {} columns",
                index,
                upsert.table,
                row.len(),
                upsert.columns.len()
            ));
        }
    }
    Ok(())
}

/// Builds an idempotent multi-row upsert keyed on `id`.
fn build_upsert_sql(table: &str, columns: &[String], row_count: usize) -> String {
    let row_placeholder = format!(
        "({})",
        columns.iter().map(|_| "?").collect::<Vec<_>>().join(", ")
    );
    let values = (0..row_count)
        .map(|_| row_placeholder.clone())
        .collect::<Vec<_>>()
        .join(", ");
    let assignments = columns
        .iter()
        .filter(|column| column.as_str() != "id")
        .map(|column| format!("{column} = excluded.{column}"))
        .collect::<Vec<_>>();
    let update = if assignments.is_empty() {
        "id = excluded.id".to_string()
    } else {
        assignments.join(", ")
    };
    format!(
        "INSERT INTO {table} ({}) VALUES {values} ON CONFLICT(id) DO UPDATE SET {update}",
        columns.join(", ")
    )
}

fn build_delete_sql(id_count: usize) -> String {
    let placeholders = (0..id_count).map(|_| "?").collect::<Vec<_>>().join(", ");
    format!("DELETE FROM {TOMBSTONE_TARGET_TABLE} WHERE id IN ({placeholders})")
}

async fn apply_plan(
    tx: &mut Transaction<'_, Sqlite>,
    plan: &SyncWritePlan,
) -> Result<SyncApplyReport, String> {
    let mut report = SyncApplyReport::default();

    for upsert in &plan.upserts {
        validate_upsert(upsert)?;
        if upsert.rows.is_empty() {
            continue;
        }
        let rows_per_chunk = (MAX_BIND_PARAMS / upsert.columns.len()).max(1);
        for chunk in upsert.rows.chunks(rows_per_chunk) {
            let sql = build_upsert_sql(&upsert.table, &upsert.columns, chunk.len());
            let mut query = sqlx::query(&sql);
            for row in chunk {
                for value in row {
                    query = match to_bound(value) {
                        Bound::Null => query.bind(Option::<String>::None),
                        Bound::Int(number) => query.bind(number),
                        Bound::Real(number) => query.bind(number),
                        Bound::Text(text) => query.bind(text),
                    };
                }
            }
            query
                .execute(&mut **tx)
                .await
                .map_err(|error| format!("upsert into `{}` failed: {error}", upsert.table))?;
            report.upserted_rows += chunk.len();
        }
    }

    for chunk in plan.deleted_operation_ids.chunks(MAX_BIND_PARAMS) {
        let sql = build_delete_sql(chunk.len());
        let mut query = sqlx::query(&sql);
        for id in chunk {
            query = query.bind(id.clone());
        }
        let result = query
            .execute(&mut **tx)
            .await
            .map_err(|error| format!("tombstone delete failed: {error}"))?;
        report.deleted_rows += result.rows_affected() as usize;
    }

    Ok(report)
}

/// Applies a whole sync snapshot in one transaction on one connection.
/// Any error propagates before `commit`, so the transaction is dropped and
/// SQLite rolls it back — the database is left exactly as it was.
#[tauri::command]
pub async fn apply_sync_transaction<R: Runtime>(
    app: AppHandle<R>,
    plan: SyncWritePlan,
) -> Result<SyncApplyReport, String> {
    // Clone the pool handle so the instance lock is not held across the write.
    let pool = {
        let instances = app.state::<DbInstances>();
        let instances = instances.0.read().await;
        match instances.get(crate::db::DATABASE_URL) {
            Some(DbPool::Sqlite(pool)) => pool.clone(),
            _ => return Err("local database is not loaded".to_string()),
        }
    };

    let mut tx = pool
        .begin()
        .await
        .map_err(|error| format!("could not start transaction: {error}"))?;

    match apply_plan(&mut tx, &plan).await {
        Ok(report) => {
            tx.commit()
                .await
                .map_err(|error| format!("commit failed: {error}"))?;
            Ok(report)
        }
        Err(error) => {
            // Explicit for clarity; dropping the transaction would also roll back.
            let _ = tx.rollback().await;
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::Row;

    fn upsert(table: &str, columns: &[&str], rows: Vec<Vec<Value>>) -> SyncUpsert {
        SyncUpsert {
            table: table.to_string(),
            columns: columns.iter().map(|c| c.to_string()).collect(),
            rows,
        }
    }

    #[test]
    fn builds_an_idempotent_upsert() {
        let columns = vec!["id".to_string(), "name".to_string()];
        let sql = build_upsert_sql("projects", &columns, 2);

        assert_eq!(
            sql,
            "INSERT INTO projects (id, name) VALUES (?, ?), (?, ?) \
             ON CONFLICT(id) DO UPDATE SET name = excluded.name"
        );
    }

    #[test]
    fn rejects_tables_outside_the_allowlist() {
        let plan = upsert("sqlite_master", &["id"], vec![]);
        assert!(validate_upsert(&plan).unwrap_err().contains("not syncable"));
    }

    #[test]
    fn rejects_unsafe_identifiers() {
        let plan = upsert("projects", &["id", "name); drop table projects;--"], vec![]);
        assert!(validate_upsert(&plan)
            .unwrap_err()
            .contains("not a valid identifier"));
    }

    #[test]
    fn rejects_rows_that_do_not_match_the_columns() {
        let plan = upsert("projects", &["id", "name"], vec![vec![Value::from("a")]]);
        assert!(validate_upsert(&plan).unwrap_err().contains("has 1 values"));
    }

    #[test]
    fn requires_an_id_column() {
        let plan = upsert("projects", &["name"], vec![]);
        assert!(validate_upsert(&plan).unwrap_err().contains("must include an id"));
    }

    async fn test_pool() -> sqlx::Pool<Sqlite> {
        let path = std::env::temp_dir().join(format!(
            "fateh-sync-test-{}-{:?}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let url = format!("sqlite:{}?mode=rwc", path.to_string_lossy().replace('\\', "/"));
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&url)
            .await
            .expect("pool");
        sqlx::query("CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL, name TEXT)")
            .execute(&pool)
            .await
            .expect("create table");
        pool
    }

    async fn project_count(pool: &sqlx::Pool<Sqlite>) -> i64 {
        sqlx::query("SELECT count(*) AS c FROM projects")
            .fetch_one(pool)
            .await
            .expect("count")
            .get::<i64, _>("c")
    }

    #[tokio::test]
    async fn commits_a_valid_plan() {
        let pool = test_pool().await;
        let plan = SyncWritePlan {
            upserts: vec![upsert(
                "projects",
                &["id", "name"],
                vec![vec![Value::from("p1"), Value::from("first")]],
            )],
            deleted_operation_ids: vec![],
        };

        let mut tx = pool.begin().await.unwrap();
        let report = apply_plan(&mut tx, &plan).await.unwrap();
        tx.commit().await.unwrap();

        assert_eq!(report.upserted_rows, 1);
        assert_eq!(project_count(&pool).await, 1);
    }

    #[tokio::test]
    async fn replaying_the_same_plan_is_idempotent() {
        let pool = test_pool().await;
        let plan = SyncWritePlan {
            upserts: vec![upsert(
                "projects",
                &["id", "name"],
                vec![vec![Value::from("p1"), Value::from("first")]],
            )],
            deleted_operation_ids: vec![],
        };

        for _ in 0..3 {
            let mut tx = pool.begin().await.unwrap();
            apply_plan(&mut tx, &plan).await.unwrap();
            tx.commit().await.unwrap();
        }

        assert_eq!(project_count(&pool).await, 1);
    }

    #[tokio::test]
    async fn rolls_back_every_write_when_one_statement_fails() {
        let pool = test_pool().await;
        let plan = SyncWritePlan {
            upserts: vec![
                upsert(
                    "projects",
                    &["id", "name"],
                    vec![vec![Value::from("good"), Value::from("kept?")]],
                ),
                // Valid identifier, absent column: fails at execution time,
                // after the first upsert already wrote inside the transaction.
                upsert(
                    "projects",
                    &["id", "missing_column"],
                    vec![vec![Value::from("bad"), Value::from("x")]],
                ),
            ],
            deleted_operation_ids: vec![],
        };

        let mut tx = pool.begin().await.unwrap();
        let result = apply_plan(&mut tx, &plan).await;
        assert!(result.is_err());
        tx.rollback().await.unwrap();

        assert_eq!(project_count(&pool).await, 0, "partial write must not survive");
    }

    #[tokio::test]
    async fn concurrent_readers_never_observe_an_open_transaction() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO projects (id, name) VALUES ('existing', 'before')")
            .execute(&pool)
            .await
            .unwrap();

        let mut tx = pool.begin().await.unwrap();
        sqlx::query("INSERT INTO projects (id, name) VALUES ('pending', 'during')")
            .execute(&mut *tx)
            .await
            .unwrap();

        // A separate pooled connection still sees only the committed snapshot.
        assert_eq!(project_count(&pool).await, 1);

        tx.commit().await.unwrap();
        assert_eq!(project_count(&pool).await, 2);
    }
}
