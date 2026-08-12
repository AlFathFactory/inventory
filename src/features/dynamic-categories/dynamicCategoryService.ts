import { getSupabaseConfigError, supabaseClient } from '../../lib/supabaseClient'
import { getItemMovements } from '../../services/itemsService'
import {
  buildDynamicItemArchivePatch,
  buildDynamicItemEditPatch,
  getDynamicItemStockStatus,
  matchesDynamicItemSearch,
  normalizeDynamicItemText,
  validateDynamicItemValues,
} from './dynamicItemUtils'
import type {
  DynamicCategory,
  DynamicCategoryItem,
  DynamicItemCreateInput,
  DynamicItemEditInput,
  DynamicItemFilters,
} from './types'

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
const listItemColumns =
  'id, category_id, internal_code, item_name, project, supplier_name, stock_balance, min_quantity, is_archived, created_at, updated_at'
const detailItemColumns =
  'id, category_id, internal_code, item_name, project, supplier_name, opening_balance, stock_balance, min_quantity, added, issued, total_added, total_issued, notes, source_sheet, is_archived, transaction_date, created_at, updated_at'

type RawItem = Partial<DynamicCategoryItem> & Pick<DynamicCategoryItem, 'id' | 'category_id' | 'item_name'>

export class DynamicResourceNotFoundError extends Error {}

export class DynamicItemCodeGenerationError extends Error {
  itemId: string
  item: DynamicCategoryItem

  constructor(item: DynamicCategoryItem, message: string) {
    super(message)
    this.name = 'DynamicItemCodeGenerationError'
    this.itemId = item.id
    this.item = item
  }
}

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

function mapItem(row: RawItem): DynamicCategoryItem {
  return {
    id: row.id,
    category_id: row.category_id,
    internal_code: row.internal_code ?? null,
    item_name: row.item_name,
    project: row.project ?? null,
    supplier_name: row.supplier_name ?? null,
    opening_balance: Number(row.opening_balance ?? 0),
    stock_balance: Number(row.stock_balance ?? 0),
    min_quantity: Number(row.min_quantity ?? 0),
    added: Number(row.added ?? 0),
    issued: Number(row.issued ?? 0),
    total_added: Number(row.total_added ?? 0),
    total_issued: Number(row.total_issued ?? 0),
    notes: row.notes ?? null,
    source_sheet: row.source_sheet ?? null,
    is_archived: Boolean(row.is_archived),
    transaction_date: row.transaction_date ?? null,
    created_at: row.created_at ?? '',
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
  const databaseError = error as DatabaseError
  if (databaseError?.code === 'PGRST116') {
    throw new DynamicResourceNotFoundError(fallback ?? 'السجل المطلوب غير موجود.')
  }
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

export async function listDynamicCategoryItems(categoryId: string, filters: DynamicItemFilters) {
  const client = requireSupabase()
  let query = client
    .from('inventory_items')
    .select(listItemColumns)
    .eq('category_id', categoryId)

  if (filters.archive !== 'all') {
    query = query.eq('is_archived', filters.archive === 'archived')
  }

  const normalizedSearch = normalizeDynamicItemText(filters.search)
  const canUseServerSearch = /^[\p{L}\p{N}\s-]+$/u.test(normalizedSearch)
  if (normalizedSearch && canUseServerSearch) {
    const pattern = `%${normalizedSearch}%`
    query = query.or(
      `item_name.ilike.${pattern},internal_code.ilike.${pattern},supplier_name.ilike.${pattern},project.ilike.${pattern}`,
    )
  }

  const sortColumn = {
    name: 'item_name',
    code: 'internal_code',
    balance: 'stock_balance',
    updated: 'updated_at',
  }[filters.sort]
  const { data, error } = await query.order(sortColumn, {
    ascending: filters.sort !== 'updated',
    nullsFirst: false,
  })

  if (error) {
    throwDatabaseError(error, 'تعذر تحميل أصناف التصنيف.')
  }

  return ((data ?? []) as unknown as RawItem[])
    .map(mapItem)
    .filter((item) => matchesDynamicItemSearch(item, normalizedSearch))
    .filter(
      (item) =>
        filters.status === 'all' ||
        getDynamicItemStockStatus(item.stock_balance, item.min_quantity) === filters.status,
    )
}

export async function getDynamicItem(itemId: string, categoryId?: string) {
  const client = requireSupabase()
  let query = client.from('inventory_items').select(detailItemColumns).eq('id', itemId)
  if (categoryId) query = query.eq('category_id', categoryId)
  const { data, error } = await query.single()

  if (error) throwDatabaseError(error, 'الصنف المطلوب غير موجود.')
  return mapItem(data as unknown as RawItem)
}

type DynamicItemCreationGateway = {
  create: (input: DynamicItemCreateInput) => Promise<DynamicCategoryItem>
  generateCode: (itemId: string) => Promise<void>
  refetch: (itemId: string, categoryId: string) => Promise<DynamicCategoryItem>
}

const liveDynamicItemCreationGateway: DynamicItemCreationGateway = {
  create: createDynamicInventoryItemRow,
  generateCode: generateDynamicInventoryItemCode,
  refetch: getDynamicItem,
}

export async function createDynamicInventoryItem(
  input: DynamicItemCreateInput,
  gateway: DynamicItemCreationGateway = liveDynamicItemCreationGateway,
) {
  const validationError = validateDynamicItemValues(
    input.itemName,
    input.openingBalance,
    input.minQuantity,
  )
  if (validationError) throw new Error(validationError)

  const createdItem = await gateway.create(input)
  try {
    await gateway.generateCode(createdItem.id)
  } catch (error) {
    let latestItem = createdItem
    try {
      latestItem = await gateway.refetch(createdItem.id, input.categoryId)
    } catch {
      // The item was already created; retain its returned row for recovery messaging.
    }
    throw new DynamicItemCodeGenerationError(
      latestItem,
      `تم إنشاء الصنف، لكن تعذر توليد الكود الداخلي: ${getDynamicCategoryErrorMessage(error)}`,
    )
  }

  const refetchedItem = await gateway.refetch(createdItem.id, input.categoryId)
  if (!refetchedItem.internal_code) {
    throw new DynamicItemCodeGenerationError(
      refetchedItem,
      'تم إنشاء الصنف، لكن الكود الداخلي لم يظهر بعد إعادة تحميل بياناته.',
    )
  }
  return refetchedItem
}

async function createDynamicInventoryItemRow(input: DynamicItemCreateInput) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('create_inventory_item', {
    p_category_id: input.categoryId,
    p_item_name: normalizeDynamicItemText(input.itemName),
    p_opening_balance: input.openingBalance,
    p_min_quantity: input.minQuantity,
    p_supplier_name: normalizeDynamicItemText(input.supplierName) || null,
    p_notes: input.notes.trim() || null,
  })

  if (error) throwDatabaseError(error, 'تعذر إنشاء الصنف.')
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('تمت العملية دون إرجاع بيانات الصنف الجديد.')
  return mapItem(row as unknown as RawItem)
}

async function generateDynamicInventoryItemCode(itemId: string) {
  const client = requireSupabase()
  const { error } = await client.rpc('generate_inventory_internal_code_rpc', {
    p_table_name: 'inventory_items',
    p_item_id: itemId,
  })
  if (error) throwDatabaseError(error, 'تعذر توليد الكود الداخلي.')
}

export async function updateDynamicInventoryItem(itemId: string, input: DynamicItemEditInput) {
  const itemName = normalizeDynamicItemText(input.itemName)
  if (!itemName) throw new Error('اسم الصنف مطلوب.')
  if (!Number.isFinite(input.minQuantity) || input.minQuantity < 0) {
    throw new Error('يجب أن يكون الحد الأدنى صفرًا أو أكثر.')
  }

  const client = requireSupabase()
  const { error } = await client.rpc('update_inventory_item_details_rpc', {
    p_table_name: 'inventory_items',
    p_item_id: itemId,
    p_patch: buildDynamicItemEditPatch({ ...input, itemName }),
    p_adjust_date: new Date().toISOString().slice(0, 10),
    p_notes: null,
    p_updated_by: 'user',
  })
  if (error) throwDatabaseError(error, 'تعذر تعديل بيانات الصنف.')
  return getDynamicItem(itemId)
}

export async function setDynamicInventoryItemArchived(itemId: string, isArchived: boolean) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('inventory_items')
    .update(buildDynamicItemArchivePatch(isArchived))
    .eq('id', itemId)
    .select(detailItemColumns)
    .single()

  if (error) {
    throwDatabaseError(error, isArchived ? 'تعذر أرشفة الصنف.' : 'تعذر استعادة الصنف.')
  }
  return mapItem(data as unknown as RawItem)
}

export async function listDynamicItemMovements(itemId: string) {
  const result = await getItemMovements('inventory_items', itemId)
  if (result.error) throw new Error(result.error)
  return result.data
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
