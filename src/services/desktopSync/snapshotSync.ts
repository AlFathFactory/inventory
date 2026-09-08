import { applySyncTransaction } from '../../lib/localDb/transaction'
import {
  markSyncFailed,
  markSyncStarted,
  markSyncSucceeded,
} from '../../lib/localDb/syncState'
import { SNAPSHOT_PAGE_SIZE, fetchInventorySnapshotPage } from './snapshotClient'
import { parseSnapshotPage } from './snapshotPayload'
import { SYNC_TABLE_COLUMNS, SYNC_TABLE_NAMES, type SyncTableName } from './syncTables'

/**
 * Tables are loaded in this order so `inventory_operations` is fully present
 * before the tombstones that delete rows from it are applied. Everything else
 * keeps the declared order.
 */
export const SNAPSHOT_TABLE_ORDER: SyncTableName[] = [
  ...SYNC_TABLE_NAMES.filter((table) => table !== 'inventory_operation_deletions'),
  'inventory_operation_deletions',
]

/** Guards against a server that never stops reporting `has_more`. */
export const MAX_PAGES_PER_TABLE = 2_000

export interface SnapshotSyncResult {
  status: 'succeeded' | 'failed'
  snapshotCursor?: string
  pages?: number
  rowCounts?: Record<SyncTableName, number>
  upsertedRows?: number
  deletedRows?: number
  /** The table that failed, when it can be attributed to one. */
  failedTable?: SyncTableName
  error?: string
}

export interface SnapshotSyncDependencies {
  fetchPage: typeof fetchInventorySnapshotPage
  applyPlan: typeof applySyncTransaction
  onStarted: typeof markSyncStarted
  onSucceeded: typeof markSyncSucceeded
  onFailed: typeof markSyncFailed
  pageSize?: number
}

const productionDependencies: SnapshotSyncDependencies = {
  fetchPage: fetchInventorySnapshotPage,
  applyPlan: applySyncTransaction,
  onStarted: markSyncStarted,
  onSucceeded: markSyncSucceeded,
  onFailed: markSyncFailed,
}

/**
 * The initial full snapshot, loaded as bounded pages.
 *
 * Every page is applied in its own local transaction, but the sync cursor is
 * stored only after every table has completed. A failure part-way therefore
 * leaves the previous cursor untouched, so the next launch re-runs the whole
 * snapshot rather than resuming from a half-applied state that would look
 * successful. Page writes are idempotent upserts keyed on `id`, so re-running
 * converges on the server's state.
 *
 * The pages all read at one server-minted `snapshot_cursor`, so the result is
 * a consistent point-in-time view even though it spans many requests.
 */
export async function runPaginatedSnapshotSync(
  overrides: Partial<SnapshotSyncDependencies> = {},
): Promise<SnapshotSyncResult> {
  const dependencies = { ...productionDependencies, ...overrides }
  const pageSize = dependencies.pageSize ?? SNAPSHOT_PAGE_SIZE

  await dependencies.onStarted()

  let snapshotCursor: string | null = null
  let pages = 0
  let upsertedRows = 0
  let deletedRows = 0
  const rowCounts = Object.fromEntries(
    SYNC_TABLE_NAMES.map((table) => [table, 0]),
  ) as Record<SyncTableName, number>
  let currentTable: SyncTableName | undefined

  try {
    for (const table of SNAPSHOT_TABLE_ORDER) {
      currentTable = table
      let after = null as { updated_at: string; id: string } | null
      let pageIndex = 0

      for (;;) {
        if (pageIndex >= MAX_PAGES_PER_TABLE) {
          throw new Error(`Snapshot for "${table}" exceeded ${MAX_PAGES_PER_TABLE} pages`)
        }

        const raw = await dependencies.fetchPage({
          table,
          snapshotCursor,
          after,
          limit: pageSize,
        })
        const page = parseSnapshotPage(raw, table)
        pages += 1
        pageIndex += 1

        // The first page mints the cursor; every later page must reuse it or
        // the snapshot would span several inconsistent points in time.
        if (snapshotCursor === null) {
          snapshotCursor = page.snapshotCursor
        } else if (page.snapshotCursor !== snapshotCursor) {
          throw new Error(
            `Snapshot cursor changed mid-run for "${table}": expected ${snapshotCursor}, received ${page.snapshotCursor}`,
          )
        }

        if (page.rows.length > 0) {
          // Tombstone rows are stored *and* applied as deletions, exactly as
          // the delta path does, so a snapshot and a delta leave the local
          // database in the same state.
          const report = await dependencies.applyPlan({
            upserts: [{
              table,
              columns: [...SYNC_TABLE_COLUMNS[table]] as string[],
              rows: page.rows,
            }],
            deletedOperationIds: page.deletedOperationIds,
          })
          upsertedRows += report.upsertedRows
          deletedRows += report.deletedRows
          rowCounts[table] += page.rows.length
        }

        if (!page.hasMore || page.nextPageCursor === null) break
        after = page.nextPageCursor
      }
    }

    if (snapshotCursor === null) {
      throw new Error('Snapshot completed without a snapshot cursor')
    }

    // Reached only after every table and page committed locally.
    await dependencies.onSucceeded(snapshotCursor)

    return {
      status: 'succeeded',
      snapshotCursor,
      pages,
      rowCounts,
      upsertedRows,
      deletedRows,
    }
  } catch (error) {
    // Deliberately never writes the cursor, so a partial snapshot can never
    // be mistaken for a complete one.
    await dependencies.onFailed(error)
    return {
      status: 'failed',
      pages,
      failedTable: currentTable,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
