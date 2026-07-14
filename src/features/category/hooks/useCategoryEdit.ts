import { useState } from 'react'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import {
  getCustodyRecord,
  getItemDetails,
  type CategorySummaryItem,
  type ItemDetails,
} from '../../../services/itemsService'
import { archiveLongWeldingGlove } from '../../../services/longWeldingGlovesService'
import type { RefreshCategoryRows, SetCategoryMessage } from './categoryHookTypes'

export function useCategoryEdit({
  category,
  refreshRows,
  setMessage,
}: {
  category: CategoryDefinition | null
  refreshRows: RefreshCategoryRows
  setMessage: SetCategoryMessage
}) {
  const [editingItem, setEditingItem] = useState<ItemDetails | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)

  async function open(row: CategorySummaryItem) {
    if (!category) return

    setIsPreparing(true)
    setMessage(null)
    const result = category.table === 'long_welding_gloves' || category.table === 'cutting_discs'
      ? await getCustodyRecord(category.table, String(row.item_id))
      : await getItemDetails(category.table, String(row.item_id))
    setIsPreparing(false)

    if (result.error || !result.data) {
      setMessage({ type: 'error', text: result.error || 'تعذر تحميل بيانات الصنف' })
      return
    }

    setEditingItem(category.table === 'long_welding_gloves' || category.table === 'cutting_discs' ? {
      ...result.data,
      table_name: category.table,
      category_name: category.label,
      item_id: result.data.id,
      item_key: null,
      project_name: null,
      item_name: result.data.type_name,
      stock_balance: null,
      min_quantity: null,
      status: null,
      total_added: null,
      total_issued: null,
      source_rows_count: 1,
      updated_at: null,
      created_at: null,
    } as ItemDetails : result.data as ItemDetails)
  }

  async function handleSuccess(balanceChanged: boolean) {
    if (!category || !editingItem) return

    await refreshRows()
    setEditingItem(null)
    setMessage({
      type: 'success',
      text: category.table === 'cutting_discs'
        ? 'تم تعديل الصاروخ بنجاح'
        : category.table === 'long_welding_gloves'
        ? 'تم تعديل سجل العهدة بنجاح'
        : balanceChanged
          ? 'تم تعديل بيانات الصنف بنجاح — تم تعديل الرصيد وتسجيل حركة جرد / تعديل رصيد'
          : 'تم تعديل بيانات الصنف بنجاح',
    })
  }

  async function archiveGlove(row: CategorySummaryItem) {
    if (!window.confirm('هل تريد أرشفة سجل العهدة هذا؟')) return

    const result = await archiveLongWeldingGlove(String(row.item_id))
    if (result.error) {
      setMessage({ type: 'error', text: result.error })
      return
    }

    await refreshRows()
    setMessage({ type: 'success', text: 'تمت أرشفة سجل العهدة' })
  }

  return {
    editingItem,
    isPreparing,
    open,
    close: () => setEditingItem(null),
    handleSuccess,
    archiveGlove,
  }
}
