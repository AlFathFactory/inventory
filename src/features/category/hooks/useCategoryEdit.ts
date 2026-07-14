import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import {
  type CategorySummaryItem,
  type ItemDetails,
} from '../../../services/itemsService'
import { archiveLongWeldingGlove } from '../../../services/longWeldingGlovesService'
import {
  invalidateCategoryData,
  invalidateItemData,
} from '../../inventory/inventoryCache'
import {
  custodyItemQueryOptions,
  itemQueryOptions,
} from '../../inventory/inventoryQueries'
import type { SetCategoryMessage } from './categoryHookTypes'

export function useCategoryEdit({
  category,
  setMessage,
}: {
  category: CategoryDefinition | null
  setMessage: SetCategoryMessage
}) {
  const queryClient = useQueryClient()
  const [editingItem, setEditingItem] = useState<ItemDetails | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)

  async function open(row: CategorySummaryItem) {
    if (!category) return

    setIsPreparing(true)
    setMessage(null)
    const itemId = String(row.item_id)
    const result = await (
      category.table === 'long_welding_gloves' || category.table === 'cutting_discs'
        ? queryClient.fetchQuery(custodyItemQueryOptions(category.table, itemId))
        : queryClient.fetchQuery(itemQueryOptions(category.table, itemId))
    )
      .then((data) => ({ data, error: null }))
      .catch((error: unknown) => ({
        data: null,
        error: error instanceof Error ? error.message : 'Failed to load item.',
      }))
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

    await invalidateItemData(
      queryClient,
      category.table,
      String(editingItem.item_id),
    )
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
    if (!category) return
    if (!window.confirm('هل تريد أرشفة سجل العهدة هذا؟')) return

    const result = await archiveLongWeldingGlove(String(row.item_id))
    if (result.error) {
      setMessage({ type: 'error', text: result.error })
      return
    }

    await invalidateCategoryData(queryClient, category.table)
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
