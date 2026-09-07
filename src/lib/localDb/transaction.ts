import { isDesktopRuntime } from '../../config/platform'

/** A value SQLite can bind directly. */
export type SyncBindValue = string | number | null

export interface SyncUpsertPlan {
  table: string
  columns: string[]
  rows: SyncBindValue[][]
}

export interface SyncWritePlan {
  upserts: SyncUpsertPlan[]
  /** `inventory_operations.id` values removed by tombstones. */
  deletedOperationIds: string[]
}

export interface SyncApplyReport {
  upsertedRows: number
  deletedRows: number
}

/**
 * Applies a write plan inside one Rust-owned SQLite transaction.
 *
 * The transaction boundary deliberately lives in Rust: the SQL plugin runs
 * each JS statement on a pooled connection, so `BEGIN`/`COMMIT` issued from
 * here could straddle connections. Rust takes a single connection for the
 * whole write and rolls back on any error.
 *
 * Only a structured plan crosses the boundary — never SQL text — so no
 * caller can run arbitrary statements through this API.
 */
export async function applySyncTransaction(plan: SyncWritePlan): Promise<SyncApplyReport> {
  if (!isDesktopRuntime()) {
    throw new Error('Local database transactions are only available in the desktop runtime.')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<SyncApplyReport>('apply_sync_transaction', { plan })
}
