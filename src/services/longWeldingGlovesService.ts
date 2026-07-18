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
  const { data, error } = await supabaseClient.rpc('create_inventory_item_rpc', {
    p_table_name: 'long_welding_gloves',
    p_payload: values,
    p_created_by: 'user',
  })
  if (error) return { data: null, error: error.message }
  try {
    if (typeof data !== 'object' || !('ok' in data) || !data.ok || !('row' in data)) {
      return { data: null, error: 'Inventory create RPC returned an invalid response.' }
    }
    const response = data as { row: LongWeldingGloveRecord; internal_code?: string | null }
    return { data: { ...response.row, internal_code: response.internal_code ?? null }, error: null }
  } catch (codeError) {
    return { data: null, error: codeError instanceof Error ? codeError.message : 'تعذر إنشاء كود الصنف' }
  }
}

export async function updateLongWeldingGlove(
  id: string,
  values: LongWeldingGloveInput,
): Result<LongWeldingGloveRecord> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()
  const { data, error } = await supabaseClient.rpc('update_custody_item_details_rpc', {
    p_table_name: 'long_welding_gloves',
    p_item_id: id,
    p_patch: values,
    p_updated_by: 'user',
  })
  return error
    ? { data: null, error: error.message }
    : { data: ((data as { row?: LongWeldingGloveRecord }).row ?? data) as LongWeldingGloveRecord, error: null }
}

export async function archiveLongWeldingGlove(id: string): Result<null> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()
  const { error } = await supabaseClient.rpc('update_custody_item_details_rpc', {
    p_table_name: 'long_welding_gloves',
    p_item_id: id,
    p_patch: { is_archived: true },
    p_updated_by: 'user',
  })
  return error ? { data: null, error: error.message } : { data: null, error: null }
}
