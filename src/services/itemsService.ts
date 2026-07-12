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
  source_rows_count: number | string | null
  updated_at: string | null
  created_at: string | null
}

export type ItemDetails = CategorySummaryItem

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

export async function getItemDetails(
  tableName: string,
  itemId: string,
): ServiceResult<ItemDetails> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
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
