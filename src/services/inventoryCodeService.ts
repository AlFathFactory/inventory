import { supabaseClient } from '../lib/supabaseClient'
import { isInventoryTable } from './inventoryTablePolicy'

export async function generateInventoryInternalCode(
  tableName: string,
  itemId: unknown,
) {
  if (!supabaseClient) throw new Error('Supabase غير مهيأ')
  if (!isInventoryTable(tableName)) {
    throw new Error(`Unsupported inventory table: ${tableName}`)
  }
  if (typeof itemId !== 'string' && typeof itemId !== 'number') {
    throw new Error('A valid inventory item ID is required.')
  }
  const { data, error } = await supabaseClient.rpc(
    'generate_inventory_internal_code_rpc',
    { p_table_name: tableName, p_item_id: itemId },
  )
  if (error) throw new Error(error.message)
  const record = Array.isArray(data) ? data[0] : data
  if (record && typeof record === 'object' && 'internal_code' in record && record.internal_code) {
    return String(record.internal_code)
  }
  throw new Error('تم إنشاء الصنف لكن تعذرت قراءة كود الصنف')
}
