import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'
import {
  getStockStatusFromValues,
  getStockStatusLabel,
} from '../utils/statusUtils'

export type CategorySummaryItem = {
  table_name: string
  category_name: string
  item_id: string | number
  item_key: string | null
  internal_code?: string | null
  project_name: string | null
  project?: string | null
  item_name: string | null
  stock_balance: number | string | null
  min_quantity: number | string | null
  production_date?: string | null
  expire_date?: string | null
  status: string | null
  total_added: number | string | null
  total_issued: number | string | null
  weight?: number | string | null
  length?: number | string | null
  width?: number | string | null
  th?: number | string | null
  dimension_text?: string | null
  material_source?: string | null
  supplier_name?: string | null
  din?: string | null
  code_number?: string | null
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
  internal_code?: string | null
  supplier_name?: string | null
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
  internal_code?: string | null
  item_name: string | null
  item_label: string | null
  project_name: string | null
  project: string | null
  operation_type: string | null
  quantity: number | string | null
  operation_date: string | null
  issued_quantity: number | string | null
  added_quantity: number | string | null
  returned_quantity: number | string | null
  quantity_already_returned: number | string | null
  remaining_returnable_quantity: number | string | null
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
  code_number?: string | null
  notes: string | null
  created_by: string | null
  created_at: string | null
  related_operation_id: string | null
  original_issued_to: string | null
  original_issue_date: string | null
  original_issue_code: string | null
  returnedQuantity: number
  returnStatus: 'not_returned' | 'partially_returned' | 'fully_returned'
  relatedOperationId: string | null
  remainingReturnableQuantity: number
  allocationStatus?: 'allocated' | 'pending_distribution'
  employeeAllocations?: Array<{
    employee_id: string
    employee_name_snapshot: string
    allocated_quantity: number | string | null
    returned_quantity: number | string
  }>
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

const categoryQueryPageSize = 1000

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

function withComputedStockStatus<TItem extends CategorySummaryItem>(
  item: TItem,
): TItem {
  const status = getStockStatusFromValues(
    item.stock_balance,
    item.min_quantity,
  )

  return status
    ? { ...item, status: getStockStatusLabel(status) }
    : item
}

async function getAllCategorySummaryRows(
  tableName: string,
): ServiceResult<CategorySummaryItem[]> {
  const rows: CategorySummaryItem[] = []

  while (true) {
    const from = rows.length
    const { data, error } = await supabaseClient!
      .from('inventory_category_items_summary_view')
      .select('*')
      .eq('table_name', tableName)
      .order('item_name', { ascending: true })
      .order('item_id', { ascending: true })
      .range(from, from + categoryQueryPageSize - 1)

    if (error) {
      return createFailure(error.message)
    }

    const page = (data ?? []) as CategorySummaryItem[]
    if (page.length === 0) {
      return createSuccess(rows)
    }

    rows.push(...page)
  }
}

type PaintProductionDateRow = {
  id: string | number
  production_date: string | null
}

type RawMaterialDimensionRow = {
  id: string | number
  dimension_text: string | null
}

async function getAllPaintProductionDates(): ServiceResult<PaintProductionDateRow[]> {
  const rows: PaintProductionDateRow[] = []

  while (true) {
    const from = rows.length
    const { data, error } = await supabaseClient!
      .from('paints')
      .select('id, production_date')
      .order('id', { ascending: true })
      .range(from, from + categoryQueryPageSize - 1)

    if (error) {
      return createFailure(error.message)
    }

    const page = (data ?? []) as PaintProductionDateRow[]
    if (page.length === 0) {
      return createSuccess(rows)
    }

    rows.push(...page)
  }
}

async function getAllRawMaterialDimensions(): ServiceResult<RawMaterialDimensionRow[]> {
  const rows: RawMaterialDimensionRow[] = []

  while (true) {
    const from = rows.length
    const { data, error } = await supabaseClient!
      .from('raw_materials')
      .select('id, dimension_text')
      .order('id', { ascending: true })
      .range(from, from + categoryQueryPageSize - 1)

    if (error) return createFailure(error.message)

    const page = (data ?? []) as RawMaterialDimensionRow[]
    if (page.length === 0) return createSuccess(rows)
    rows.push(...page)
  }
}

async function getAllCylinderRows(): ServiceResult<
  Record<string, string | number | null>[]
> {
  const rows: Record<string, string | number | null>[] = []

  while (true) {
    const from = rows.length
    const { data, error } = await supabaseClient!
      .from('cylinders')
      .select('*')
      .order('type_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + categoryQueryPageSize - 1)

    if (error) {
      return createFailure(error.message)
    }

    const page = (data ?? []) as Record<string, string | number | null>[]
    if (page.length === 0) {
      return createSuccess(rows)
    }

    rows.push(...page)
  }
}

function mapCylinderSummaryItem(
  row: Record<string, string | number | null>,
): CategorySummaryItem {
  const gasBalance = Number(row.gas_balance)
  const minQuantity = Number(row.min_quantity)
  const validGasBalance = Number.isFinite(gasBalance) ? gasBalance : 0
  const validMinQuantity = Number.isFinite(minQuantity) ? minQuantity : 0
  const itemId = typeof row.id === 'string' || typeof row.id === 'number'
    ? row.id
    : ''

  return withComputedStockStatus({
    ...row,
    table_name: 'cylinders',
    category_name: 'اسطوانات',
    item_id: itemId,
    item_key: typeof row.item_key === 'string' ? row.item_key : null,
    project_name: typeof row.project === 'string' ? row.project : null,
    item_name: typeof row.type_name === 'string' ? row.type_name : null,
    stock_balance: validGasBalance,
    min_quantity: validMinQuantity,
    status: null,
    total_added: null,
    total_issued: null,
    source_rows_count: 1,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
  })
}

export async function getCategorySummaryItems(
  tableName: string,
): ServiceResult<CategorySummaryItem[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    // The cylinder table has cylinder-specific fields and is the authoritative
    // source for min_quantity. Reading it directly also avoids stale summary
    // views that previously projected the minimum quantity as NULL.
    if (tableName === 'cylinders') {
      const result = await getAllCylinderRows()

      if (result.data === null) {
        return result
      }

      return createSuccess(
        result.data.map(mapCylinderSummaryItem),
      )
    }

    const result = await getAllCategorySummaryRows(tableName)

    if (result.data === null) {
      return result
    }

    if (tableName === 'paints') {
      const productionDatesResult = await getAllPaintProductionDates()

      if (productionDatesResult.data === null) {
        return productionDatesResult
      }

      const productionDates = new Map(
        productionDatesResult.data.map((row) => [String(row.id), row.production_date]),
      )

      return createSuccess(
        result.data.map((row) => withComputedStockStatus({
          ...row,
          production_date: productionDates.get(String(row.item_id)) ?? null,
        })),
      )
    }

    if (tableName === 'raw_materials') {
      const dimensionsResult = await getAllRawMaterialDimensions()
      if (dimensionsResult.data === null) return dimensionsResult

      const dimensions = new Map(
        dimensionsResult.data.map((row) => [String(row.id), row.dimension_text]),
      )

      return createSuccess(
        result.data.map((row) => withComputedStockStatus({
          ...row,
          dimension_text: dimensions.get(String(row.item_id)) ?? null,
        })),
      )
    }

    return createSuccess(
      result.data.map(withComputedStockStatus),
    )
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

      return createSuccess(
        mapCylinderSummaryItem(
          data as Record<string, string | number | null>,
        ) as ItemDetails,
      )
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

    if (tableName === 'paints') {
      const { data: paintDates, error: paintDatesError } = await supabaseClient!
        .from('paints')
        .select('production_date')
        .eq('id', itemId)
        .single()

      if (paintDatesError || !paintDates) {
        return createFailure(
          paintDatesError?.message || 'تعذر تحميل تاريخ إنتاج الدهان',
        )
      }

      return createSuccess(withComputedStockStatus({
        ...(data as ItemDetails),
        production_date: paintDates.production_date ?? null,
      }))
    }


    if (tableName === 'raw_materials') {
      const { data: dimension, error: dimensionError } = await supabaseClient!
        .from('raw_materials')
        .select('dimension_text')
        .eq('id', itemId)
        .single()

      if (dimensionError || !dimension) {
        return createFailure(dimensionError?.message || 'تعذر تحميل أبعاد الخامة')
      }

      return createSuccess(withComputedStockStatus({
        ...(data as ItemDetails),
        dimension_text: dimension.dimension_text ?? null,
      }))
    }

    return createSuccess(withComputedStockStatus(data as ItemDetails))
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
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (error) {
      return createFailure(error.message)
    }

    const issueIds = (data ?? [])
      .filter((row) => row.operation_type === 'issue')
      .map((row) => String(row.id))
    const allocationMap = new Map<string, ItemMovement['employeeAllocations']>()
    if (issueIds.length > 0) {
      const { data: allocationRows, error: allocationError } = await supabaseClient!
        .from('inventory_operation_employee_allocations')
        .select('issue_operation_id,employee_id,employee_name_snapshot,allocated_quantity,returned_quantity')
        .in('issue_operation_id', issueIds)
      if (allocationError) return createFailure(allocationError.message)
      for (const allocation of allocationRows ?? []) {
        const issueId = String(allocation.issue_operation_id)
        const current = allocationMap.get(issueId) ?? []
        current.push(allocation)
        allocationMap.set(issueId, current)
      }
    }

    return createSuccess(
      ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const quantity = Number(row.quantity ?? 0)
        const returnedQuantity = Number(row.returned_quantity ?? 0)
        const normalizedQuantity = Number.isFinite(quantity) ? quantity : 0
        const normalizedReturnedQuantity = Number.isFinite(returnedQuantity)
          ? returnedQuantity
          : 0
        const remainingReturnableQuantity = Math.max(
          normalizedQuantity - normalizedReturnedQuantity,
          0,
        )
        const rawReturnStatus = row.return_status
        const returnStatus =
          rawReturnStatus === 'partially_returned' ||
          rawReturnStatus === 'fully_returned'
            ? rawReturnStatus
            : 'not_returned'

        const employeeAllocations = allocationMap.get(String(row.id)) ?? []
        const allocationStatus = employeeAllocations.length > 1 &&
          employeeAllocations.some((allocation) => allocation.allocated_quantity === null)
          ? 'pending_distribution'
          : 'allocated'

        return {
          ...row,
          returnedQuantity: normalizedReturnedQuantity,
          returnStatus,
          relatedOperationId:
            typeof row.related_operation_id === 'string'
              ? row.related_operation_id
              : null,
          remainingReturnableQuantity,
          employeeAllocations,
          allocationStatus,
        } as ItemMovement
      }),
    )
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
    const editablePatch = { ...patch }
    delete editablePatch.internal_code
    const { data, error } = await supabaseClient!.rpc(
      'update_inventory_item_details_rpc',
      {
        p_table_name: tableName,
        p_item_id: itemId,
        p_patch: editablePatch,
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
