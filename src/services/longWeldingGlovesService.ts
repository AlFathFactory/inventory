import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'

export type LongWeldingGloveInput = {
  type_name: string
  received_by: string
  received_date: string
  notes: string | null
  supplier_name?: string | null
}

export type LongWeldingGloveRecord = LongWeldingGloveInput & {
  id: string | number
  internal_code?: string | null
  is_archived: boolean
}

type Result<T> = Promise<{ data: T; error: null } | { data: null; error: string }>

function unavailable<T>(): Result<T> {
  return Promise.resolve({ data: null, error: getSupabaseConfigError() })
}

export async function listLongWeldingGloves(): Result<LongWeldingGloveRecord[]> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()
  const { data, error } = await supabaseClient
    .from('long_welding_gloves')
    .select('*')
    .eq('is_archived', false)
    .order('received_date', { ascending: false })
  return error
    ? { data: null, error: error.message }
    : { data: (data ?? []) as LongWeldingGloveRecord[], error: null }
}

export async function createLongWeldingGlove(
  values: LongWeldingGloveInput,
): Result<LongWeldingGloveRecord> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()
  const { data, error } = await supabaseClient
    .from('long_welding_gloves')
    .insert(values)
    .select()
    .single()
  return error
    ? { data: null, error: error.message }
    : { data: data as LongWeldingGloveRecord, error: null }
}

export async function updateLongWeldingGlove(
  id: string,
  values: LongWeldingGloveInput,
): Result<LongWeldingGloveRecord> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()
  const { data, error } = await supabaseClient
    .from('long_welding_gloves')
    .update(values)
    .eq('id', id)
    .select()
    .single()
  return error
    ? { data: null, error: error.message }
    : { data: data as LongWeldingGloveRecord, error: null }
}

export async function archiveLongWeldingGlove(id: string): Result<null> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()
  const { error } = await supabaseClient
    .from('long_welding_gloves')
    .update({ is_archived: true })
    .eq('id', id)
  return error ? { data: null, error: error.message } : { data: null, error: null }
}
