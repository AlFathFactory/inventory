import type { SyncWritePlan } from '../../lib/localDb/transaction'
import type { SyncSnapshot } from './syncPayload'
import { SYNC_TABLE_COLUMNS, SYNC_TABLE_NAMES } from './syncTables'

/**
 * Turns a validated snapshot into the write plan executed by the Rust
 * transaction command. Pure and shared by full and delta sync — tables with
 * no rows are omitted so an empty delta produces an empty plan.
 *
 * Statement construction, batching and ordering (upserts before tombstones)
 * all live in Rust, next to the connection that runs them.
 */
export function buildSyncWritePlan(snapshot: SyncSnapshot): SyncWritePlan {
  const upserts = SYNC_TABLE_NAMES.flatMap((table) => {
    const rows = snapshot.tables[table]
    if (rows.length === 0) {
      return []
    }
    return [{
      table,
      columns: [...SYNC_TABLE_COLUMNS[table]] as string[],
      rows,
    }]
  })

  return { upserts, deletedOperationIds: snapshot.deletedOperationIds }
}
