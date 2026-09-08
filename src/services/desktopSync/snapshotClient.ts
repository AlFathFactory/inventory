import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../../lib/supabaseClient'
import type { SyncTableName } from './syncTables'

export const SNAPSHOT_PAGE_RPC = 'get_inventory_snapshot_page_rpc'

/**
 * Rows per page.
 *
 * Sized from measured production timing: one 500-row page costs ~131 ms of
 * server time against the anon role's 3 s statement_timeout (~4% of budget),
 * where the old single-statement full snapshot cost ~2.7 s (~89%) and failed
 * roughly half the time.
 */
export const SNAPSHOT_PAGE_SIZE = 500

export interface SnapshotPageCursor {
  updated_at: string
  id: string
}

export interface FetchSnapshotPageParams {
  table: SyncTableName
  /** Absent on the very first page; the server then mints one. */
  snapshotCursor?: string | null
  after?: SnapshotPageCursor | null
  limit?: number
}

/**
 * Fetches one snapshot page and nothing else — no validation, no mapping, no
 * database access. Uses the shared publishable-key client; no service-role
 * credentials are involved.
 */
export async function fetchInventorySnapshotPage(
  params: FetchSnapshotPageParams,
): Promise<unknown> {
  if (!isSupabaseConfigured || !supabaseClient) {
    throw new Error(getSupabaseConfigError())
  }

  const { data, error } = await supabaseClient.rpc(SNAPSHOT_PAGE_RPC, {
    p_table: params.table,
    p_snapshot_cursor: params.snapshotCursor ?? null,
    p_after_cursor: params.after?.updated_at ?? null,
    p_after_id: params.after?.id ?? null,
    p_limit: params.limit ?? SNAPSHOT_PAGE_SIZE,
  })

  if (error) {
    throw new Error(error.message)
  }
  return data
}
