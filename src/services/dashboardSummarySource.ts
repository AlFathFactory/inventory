import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'
import type { DashboardSummaryPayload } from '../repositories/contracts'

/**
 * The raw remote dashboard envelope.
 *
 * Kept in its own module so the Supabase repository can reach it without
 * importing `dashboardService`, which itself resolves repositories — that
 * would be a cycle. The transform into `DashboardData` stays in
 * `dashboardService`, shared by both runtimes.
 */
export async function fetchRemoteDashboardSummary(): Promise<DashboardSummaryPayload> {
  if (!isSupabaseConfigured || !supabaseClient) {
    throw new Error(getSupabaseConfigError())
  }

  const { data, error } = await supabaseClient.rpc('get_inventory_dashboard_summary_rpc')
  if (error) throw new Error(error.message)

  return (data ?? {}) as DashboardSummaryPayload
}
