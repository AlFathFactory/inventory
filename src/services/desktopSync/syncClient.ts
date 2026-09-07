import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../../lib/supabaseClient'

export const SYNC_DELTA_RPC = 'get_inventory_sync_delta_rpc'

/**
 * Fetches a sync payload from Supabase and nothing else — no validation,
 * no mapping, no database access. Uses the shared publishable-key client;
 * no service-role credentials are involved.
 *
 * @param since `null` requests a full snapshot.
 */
export async function fetchInventorySyncDelta(since: string | null): Promise<unknown> {
  if (!isSupabaseConfigured || !supabaseClient) {
    throw new Error(getSupabaseConfigError())
  }
  const { data, error } = await supabaseClient.rpc(SYNC_DELTA_RPC, { p_since: since })
  if (error) {
    throw new Error(error.message)
  }
  return data
}
