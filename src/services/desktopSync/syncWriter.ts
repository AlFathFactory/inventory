import type Database from '@tauri-apps/plugin-sql'
import type { SyncBindValue, SyncSnapshot } from './syncPayload'
import {
  SYNC_TABLE_COLUMNS,
  SYNC_TABLE_NAMES,
  TOMBSTONE_TARGET_TABLE,
  type SyncTableName,
} from './syncTables'

/**
 * Conservative cap on bind parameters per statement, well under SQLite's
 * limit, so wide tables still batch many rows per round trip.
 */
const MAX_BIND_PARAMS = 900

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [items]
  }
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

/** `INSERT ... ON CONFLICT(id) DO UPDATE`, so re-running a sync is a no-op. */
function buildUpsertSql(table: SyncTableName, columns: readonly string[], rowCount: number) {
  const rowPlaceholders: string[] = []
  let parameter = 1
  for (let row = 0; row < rowCount; row += 1) {
    rowPlaceholders.push(`(${columns.map(() => `$${parameter++}`).join(', ')})`)
  }
  const updatable = columns.filter((column) => column !== 'id')
  const assignments = updatable.length > 0
    ? updatable.map((column) => `${column} = excluded.${column}`).join(', ')
    : 'id = excluded.id'
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${rowPlaceholders.join(', ')} ` +
    `ON CONFLICT(id) DO UPDATE SET ${assignments}`
}

async function upsertTable(
  db: Database,
  table: SyncTableName,
  rows: SyncBindValue[][],
): Promise<void> {
  if (rows.length === 0) {
    return
  }
  const columns = SYNC_TABLE_COLUMNS[table] as readonly string[]
  const rowsPerChunk = Math.max(1, Math.floor(MAX_BIND_PARAMS / columns.length))
  for (const rowChunk of chunk(rows, rowsPerChunk)) {
    await db.execute(
      buildUpsertSql(table, columns, rowChunk.length),
      rowChunk.flat(),
    )
  }
}

async function applyTombstones(db: Database, operationIds: string[]): Promise<void> {
  if (operationIds.length === 0) {
    return
  }
  for (const idChunk of chunk(operationIds, MAX_BIND_PARAMS)) {
    const placeholders = idChunk.map((_, index) => `$${index + 1}`).join(', ')
    await db.execute(
      `DELETE FROM ${TOMBSTONE_TARGET_TABLE} WHERE id IN (${placeholders})`,
      idChunk,
    )
  }
}

/**
 * Writes a validated snapshot. Must be called inside a transaction — it
 * neither opens nor commits one. Tombstones are applied after the upserts
 * so a row that was re-sent and then deleted ends up deleted.
 */
export async function applySyncSnapshot(db: Database, snapshot: SyncSnapshot): Promise<void> {
  for (const table of SYNC_TABLE_NAMES) {
    await upsertTable(db, table, snapshot.tables[table])
  }
  await applyTombstones(db, snapshot.deletedOperationIds)
}
