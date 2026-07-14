import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'

export const deletableInventoryTables = [
  'consumables',
  'paints',
  'screws',
  'stock_screws',
  'raw_materials',
  'cylinders',
  'cutting_discs',
  'long_welding_gloves',
] as const

export type DeletableInventoryTable = typeof deletableInventoryTables[number]

type DeleteRpcResponse = {
  ok?: boolean
}

type DeleteResult = Promise<
  { data: DeleteRpcResponse; error: null }
  | { data: null; error: string }
>

export function isDeletableInventoryTable(
  tableName: string,
): tableName is DeletableInventoryTable {
  return deletableInventoryTables.some((supportedTable) => supportedTable === tableName)
}

export async function deleteInventoryRecordPermanently({
  tableName,
  recordId,
}: {
  tableName: DeletableInventoryTable
  recordId: string
}): DeleteResult {
  if (!isSupabaseConfigured || !supabaseClient) {
    return { data: null, error: getSupabaseConfigError() }
  }

  const { data, error } = await supabaseClient.rpc(
    'delete_inventory_record_permanently_rpc',
    {
      p_table_name: tableName,
      p_record_id: recordId,
      p_delete_movements: true,
    },
  )

  if (error) return { data: null, error: error.message }

  const response = data as DeleteRpcResponse | null
  if (!response?.ok) return { data: null, error: 'فشل حذف السجل' }

  return { data: response, error: null }
}
