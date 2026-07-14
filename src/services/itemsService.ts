import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'

export type CategorySummaryItem = {
  table_name: string
  category_name: string
  item_id: string | number
  item_key: string | null
  project_name: string | null
  item_name: string | null
  stock_balance: number | string | null
  min_quantity: number | string | null
  expire_date?: string | null
  status: string | null
  total_added: number | string | null
  total_issued: number | string | null
  weight?: number | string | null
  length?: number | string | null
  width?: number | string | null
  th?: number | string | null
  material_source?: string | null
  notes?: string | null
  code?: string | null
  type_name?: string | null
  received_by?: string | null
  received_date?: string | null
  scrapped_date?: string | null
  source_sheet?: string | null
  source_rows_count: number | string | null
  updated_at: string | null
  created_at: string | null
  [key: string]: string | number | null | undefined
}

export type ItemDetails = CategorySummaryItem

export type CustodyTableName = 'cutting_discs' | 'long_welding_gloves'
export type CustodyRecord = Record<string, string | number | null> & {
  id: string | number
  type_name: string | null
  received_by: string | null
  received_date: string | null
  source_sheet: string | null
  code?: string | null
  scrapped_date?: string | null
}

export function isCustodyTable(tableName: string): tableName is CustodyTableName {
  return tableName === 'cutting_discs' || tableName === 'long_welding_gloves'
}

export type ItemMovement = {
  id: string | number
  table_name: string
  category_name: string | null
  category_label: string | null
  item_id: string | number
  item_name: string | null
  item_label: string | null
  project_name: string | null
  project: string | null
  operation_type: string | null
  quantity: number | string | null
  operation_date: string | null
  issued_quantity: number | string | null
  added_quantity: number | string | null
  previous_balance: number | string | null
  new_balance: number | string | null
  total_added_until_operation: number | string | null
  total_issued_until_operation: number | string | null
  supplier_name: string | null
  issued_to: string | null
  received_by: string | null
  purchase_order_number: string | null
  addition_code: string | null
  issue_code: string | null
  item_code: string | null
  notes: string | null
  created_by: string | null
  created_at: string | null
}

type ServiceSuccess<TData> = {
  data: TData
  error: null
}

type ServiceFailure = {
  data: null
  error: string
}

export type ServiceResult<TData> = Promise<ServiceSuccess<TData> | ServiceFailure>

export type UpdateItemDetailsParams = {
  tableName: string
  itemId: string
  patch: Record<string, string | number | null>
  adjustDate: string | null
  notes: string | null
  updatedBy?: string
}

function createSuccess<TData>(data: TData): ServiceSuccess<TData> {
  return { data, error: null }
}

function createFailure(message: string): ServiceFailure {
  return { data: null, error: message }
}

function getClientOrFailure(): ServiceFailure | null {
  if (!isSupabaseConfigured || !supabaseClient) {
    return createFailure(getSupabaseConfigError())
  }

  return null
}

function normalizeError(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}

export async function getCategorySummaryItems(
  tableName: string,
): ServiceResult<CategorySummaryItem[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const { data, error } = await supabaseClient!
      .from('inventory_category_items_summary_view')
      .select('*')
      .eq('table_name', tableName)
      .order('item_name', { ascending: true })

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess((data ?? []) as CategorySummaryItem[])
  } catch (error) {
    return createFailure(normalizeError(error, 'تعذر تحميل ملخص أصناف القسم'))
  }
}

export async function getCustodyCategoryRows(
  tableName: CustodyTableName,
): ServiceResult<CategorySummaryItem[]> {
  const clientFailure = getClientOrFailure()
  if (clientFailure) return clientFailure

  try {
    const { data, error } = await supabaseClient!
      .from(tableName)
      .select('*')
      .order('received_date', { ascending: false })

    if (error) return createFailure(error.message)

    return createSuccess(((data ?? []) as CustodyRecord[]).map((row) => ({
      ...row,
      table_name: tableName,
      category_name: tableName === 'cutting_discs' ? 'صواريخ' : 'جوانتي لحام طويل',
      item_id: row.id,
      item_key: null,
      project_name: null,
      item_name: row.type_name,
      stock_balance: null,
      min_quantity: null,
      status: null,
      total_added: null,
      total_issued: null,
      source_rows_count: 1,
      updated_at: null,
      created_at: null,
    })))
  } catch (error) {
    return createFailure(normalizeError(error, 'تعذر تحميل سجلات العهدة'))
  }
}

export async function getCustodyRecord(
  tableName: CustodyTableName,
  recordId: string,
): ServiceResult<CustodyRecord> {
  const clientFailure = getClientOrFailure()
  if (clientFailure) return clientFailure

  try {
    const { data, error } = await supabaseClient!
      .from(tableName)
      .select('*')
      .eq('id', recordId)
      .single()

    if (error || !data) return createFailure(error?.message || 'سجل العهدة غير موجود')
    return createSuccess(data as CustodyRecord)
  } catch (error) {
    return createFailure(normalizeError(error, 'تعذر تحميل تفاصيل سجل العهدة'))
  }
}

export async function getItemDetails(
  tableName: string,
  itemId: string,
): ServiceResult<ItemDetails> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    if (tableName === 'cylinders') {
      const { data, error } = await supabaseClient!
        .from('cylinders')
        .select('*')
        .eq('id', itemId)
        .single()

      if (error || !data) {
        return createFailure(error?.message || 'تعذر تحميل بيانات الاسطوانة')
      }

      const row = data as Record<string, string | number | null>
      const gasBalance = Number(row.gas_balance)
      const minQuantity = Number(row.min_quantity)
      const validGasBalance = Number.isFinite(gasBalance) ? gasBalance : 0
      const validMinQuantity = Number.isFinite(minQuantity) ? minQuantity : 0
      return createSuccess({
        ...row,
        table_name: tableName,
        category_name: 'اسطوانات',
        item_id: row.id,
        project_name: null,
        item_name: row.type_name,
        stock_balance: validGasBalance,
        min_quantity: validMinQuantity,
        status: validGasBalance <= 0
          ? 'منتهي'
          : validGasBalance <= validMinQuantity
            ? 'قليل'
            : 'آمن',
        total_added: null,
        total_issued: null,
        source_rows_count: 1,
      } as ItemDetails)
    }

    const { data, error } = await supabaseClient!
      .from('inventory_item_details_view')
      .select('*')
      .eq('table_name', tableName)
      .eq('item_id', itemId)
      .single()

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess(data as ItemDetails)
  } catch (error) {
    return createFailure(normalizeError(error, 'تعذر تحميل تفاصيل الصنف'))
  }
}

export async function getItemMovements(
  tableName: string,
  itemId: string,
): ServiceResult<ItemMovement[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const { data, error } = await supabaseClient!
      .from('inventory_item_movements_view')
      .select('*')
      .eq('table_name', tableName)
      .eq('item_id', itemId)
      .order('operation_date', { ascending: false })

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess((data ?? []) as ItemMovement[])
  } catch (error) {
    return createFailure(normalizeError(error, 'تعذر تحميل سجل الحركات'))
  }
}

export async function updateItemDetails({
  tableName,
  itemId,
  patch,
  adjustDate,
  notes,
  updatedBy,
}: UpdateItemDetailsParams): ServiceResult<unknown> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const { data, error } = await supabaseClient!.rpc(
      'update_inventory_item_details_rpc',
      {
        p_table_name: tableName,
        p_item_id: itemId,
        p_patch: patch,
        p_adjust_date: adjustDate,
        p_notes: notes,
        p_updated_by: updatedBy || 'user',
      },
    )

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess(data)
  } catch (error) {
    return createFailure(normalizeError(error, 'تعذر تعديل بيانات الصنف'))
  }
}
