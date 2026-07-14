import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import {
  deleteInventoryRecordPermanently,
  isDeletableInventoryTable,
} from '../../../services/inventoryDeleteService'
import {
  isCustodyTable,
  type CategorySummaryItem,
} from '../../../services/itemsService'
import {
  invalidateCategoryData,
  removeItemData,
} from '../../inventory/inventoryCache'
import type { SetCategoryMessage } from './categoryHookTypes'

export function useCategoryDelete({
  category,
  setMessage,
}: {
  category: CategoryDefinition | null
  setMessage: SetCategoryMessage
}) {
  const queryClient = useQueryClient()
  const [deletingItem, setDeletingItem] = useState<CategorySummaryItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function open(row: CategorySummaryItem) {
    if (!category || !isDeletableInventoryTable(category.table)) return
    setMessage(null)
    setDeletingItem(row)
  }

  function close() {
    if (isDeleting) return
    setDeletingItem(null)
  }

  async function confirm() {
    if (!category || !deletingItem) return

    const tableName = isCustodyTable(category.table)
      ? category.table
      : deletingItem.table_name
    const recordId = isCustodyTable(category.table)
      ? deletingItem.id
      : deletingItem.item_id

    if (
      !isDeletableInventoryTable(tableName)
      || (typeof recordId !== 'string' && typeof recordId !== 'number')
    ) {
      setMessage({ type: 'error', text: 'تعذر تحديد السجل المطلوب حذفه' })
      return
    }

    setIsDeleting(true)
    setMessage(null)
    try {
      const result = await deleteInventoryRecordPermanently({
        tableName,
        recordId: String(recordId),
      })
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
        return
      }

      await invalidateCategoryData(queryClient, tableName)
      removeItemData(queryClient, tableName, String(recordId))
      setDeletingItem(null)
      setMessage({ type: 'success', text: 'تم حذف السجل نهائيًا' })
    } finally {
      setIsDeleting(false)
    }
  }

  return {
    deletingItem,
    isDeleting,
    open,
    close,
    confirm,
  }
}
