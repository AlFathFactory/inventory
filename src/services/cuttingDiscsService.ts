import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'
import { generateInventoryInternalCode } from './inventoryCodeService'

export type CuttingDiscInput = {
  code: string | null
  type_name: string
  received_by: string
  received_date: string | null
  scrapped_date: string | null
  notes: string | null
  supplier_name?: string | null
}

export type CuttingDiscRecord = CuttingDiscInput & {
  id: string | number
  internal_code?: string | null
  source_file: string | null
  source_sheet: string | null
  created_at: string | null
  updated_at: string | null
}

type Result<T> = Promise<{ data: T; error: null } | { data: null; error: string }>

function unavailable<T>(): Result<T> {
  return Promise.resolve({ data: null, error: getSupabaseConfigError() })
}

export async function listCuttingDiscs(): Result<CuttingDiscRecord[]> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()

  const { data, error } = await supabaseClient
    .from('cutting_discs')
    .select('*')
    .order('received_date', { ascending: false })

  return error
    ? { data: null, error: error.message }
    : { data: (data ?? []) as CuttingDiscRecord[], error: null }
}

export async function createCuttingDisc(
  values: CuttingDiscInput,
): Result<CuttingDiscRecord> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()

  const payload = {
    ...values,
    source_sheet: 'صواريخ',
  }
  const { data, error } = await supabaseClient
    .from('cutting_discs')
    .insert(payload)
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: 'تعذر إضافة سجل الصاروخ' }
  try {
    const internalCode = await generateInventoryInternalCode('cutting_discs', data.id)
    return { data: { ...data, internal_code: internalCode } as CuttingDiscRecord, error: null }
  } catch (codeError) {
    return { data: null, error: codeError instanceof Error ? codeError.message : 'تعذر إنشاء كود الصنف' }
  }
}

export async function updateCuttingDisc(
  id: string,
  values: CuttingDiscInput,
): Result<CuttingDiscRecord> {
  if (!isSupabaseConfigured || !supabaseClient) return unavailable()

  const { data, error } = await supabaseClient
    .from('cutting_discs')
    .update(values)
    .eq('id', id)
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: 'لم يتم العثور على سجل الصاروخ' }
  return { data: data as CuttingDiscRecord, error: null }
}
