import { getSupabaseConfigError, supabaseClient } from '../../lib/supabaseClient'
import type { DynamicCategory, DynamicCategoryItem } from './types'

export const DYNAMIC_CATEGORY_NAME_REQUIRED = 'اسم التصنيف مطلوب.'

type RawCategory = {
  id: string
  name: string
  code_prefix: string
  is_archived: boolean | null
  created_at: string
  updated_at?: string | null
  inventory_items?: { count: number | string | null }[] | { count: number | string | null } | null
}

type DatabaseError = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

const categoryColumns = 'id, name, code_prefix, is_archived, created_at, updated_at'

function requireSupabase() {
  if (!supabaseClient) {
    throw new Error(getSupabaseConfigError())
  }

  return supabaseClient
}

function readCount(value: RawCategory['inventory_items']) {
  const aggregate = Array.isArray(value) ? value[0] : value
  const count = Number(aggregate?.count ?? 0)
  return Number.isFinite(count) ? count : 0
}

function mapCategory(row: RawCategory): DynamicCategory {
  return {
    id: row.id,
    name: row.name,
    code_prefix: row.code_prefix,
    item_count: readCount(row.inventory_items),
    is_archived: Boolean(row.is_archived),
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
  }
}

export function normalizeDynamicCategoryName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function validateDynamicCategoryName(value: string) {
  return normalizeDynamicCategoryName(value) ? null : DYNAMIC_CATEGORY_NAME_REQUIRED
}

export function getDynamicCategoryErrorMessage(
  error: unknown,
  fallback = 'تعذر تنفيذ العملية. حاول مرة أخرى.',
) {
  const databaseError = (error ?? {}) as DatabaseError
  const combinedMessage = [
    databaseError.message,
    databaseError.details,
    databaseError.hint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (
    databaseError.code === '23505' ||
    combinedMessage.includes('categories_name_active_uidx') ||
    combinedMessage.includes('duplicate key')
  ) {
    return 'يوجد تصنيف نشط بهذا الاسم بالفعل.'
  }

  if (
    databaseError.code === 'P0001' ||
    combinedMessage.includes('cannot rename') ||
    combinedMessage.includes('linked inventory')
  ) {
    return 'لا يمكن تغيير اسم هذا التصنيف لأنه مرتبط بأصناف أو حركات مخزون. أنشئ تصنيفًا جديدًا بالاسم الصحيح ثم أرشف القديم.'
  }

  return databaseError.message?.trim() || fallback
}

function throwDatabaseError(error: unknown, fallback?: string): never {
  throw new Error(getDynamicCategoryErrorMessage(error, fallback))
}

export async function listDynamicCategories(): Promise<DynamicCategory[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('categories')
    .select(`${categoryColumns}, inventory_items(count)`)
    .order('is_archived', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    throwDatabaseError(error, 'تعذر تحميل التصنيفات الديناميكية.')
  }

  return ((data ?? []) as unknown as RawCategory[]).map(mapCategory)
}

export async function getDynamicCategory(categoryId: string): Promise<DynamicCategory> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('categories')
    .select(`${categoryColumns}, inventory_items(count)`)
    .eq('id', categoryId)
    .single()

  if (error) {
    throwDatabaseError(error, 'تعذر تحميل بيانات التصنيف.')
  }

  return mapCategory(data as unknown as RawCategory)
}

export async function listDynamicCategoryItems(
  categoryId: string,
): Promise<DynamicCategoryItem[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('inventory_items')
    .select(
      'id, item_name, internal_code, stock_balance, min_quantity, supplier_name, is_archived, created_at',
    )
    .eq('category_id', categoryId)
    .order('item_name', { ascending: true })

  if (error) {
    throwDatabaseError(error, 'تعذر تحميل أصناف التصنيف.')
  }

  return (data ?? []) as DynamicCategoryItem[]
}

export async function createDynamicCategory(categoryName: string) {
  const name = normalizeDynamicCategoryName(categoryName)
  if (!name) throw new Error(DYNAMIC_CATEGORY_NAME_REQUIRED)

  const client = requireSupabase()
  const { data, error } = await client.rpc('create_category', {
    p_name: name,
    p_parent_id: null,
  })

  if (error) {
    throwDatabaseError(error, 'تعذر إنشاء التصنيف.')
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('تمت العملية دون إرجاع بيانات التصنيف الجديد.')

  return mapCategory(row as unknown as RawCategory)
}

export async function renameDynamicCategory(categoryId: string, categoryName: string) {
  const name = normalizeDynamicCategoryName(categoryName)
  if (!name) throw new Error(DYNAMIC_CATEGORY_NAME_REQUIRED)

  const client = requireSupabase()
  const { data, error } = await client
    .from('categories')
    .update({ name })
    .eq('id', categoryId)
    .select(categoryColumns)
    .single()

  if (error) {
    throwDatabaseError(error, 'تعذر تغيير اسم التصنيف.')
  }

  return mapCategory(data as unknown as RawCategory)
}

export async function setDynamicCategoryArchived(categoryId: string, isArchived: boolean) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('categories')
    .update({ is_archived: isArchived })
    .eq('id', categoryId)
    .select(categoryColumns)
    .single()

  if (error) {
    throwDatabaseError(
      error,
      isArchived ? 'تعذر أرشفة التصنيف.' : 'تعذر إعادة تنشيط التصنيف.',
    )
  }

  return mapCategory(data as unknown as RawCategory)
}
