import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
)

export const supabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null

export const supabase = supabaseClient

export function getSupabaseConfigError(): string {
  if (!supabaseUrl && !supabasePublishableKey) {
    return 'Supabase environment variables are missing.'
  }

  if (!supabaseUrl) {
    return 'Missing VITE_SUPABASE_URL environment variable.'
  }

  if (!supabasePublishableKey) {
    return 'Missing VITE_SUPABASE_PUBLISHABLE_KEY environment variable.'
  }

  return 'Supabase is not configured.'
}
