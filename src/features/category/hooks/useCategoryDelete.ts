import { useState } from 'react'
import type { CategoryDefinition } from '../../../config/categoryConfig'
import {
  deleteCuttingDisc,
} from '../../../services/cuttingDiscsService'
import type { CategorySummaryItem } from '../../../services/itemsService'
import type { RefreshCategoryRows, SetCategoryMessage } from './categoryHookTypes'

export function useCategoryDelete({
  category,
  refreshRows,
  setMessage,
}: {
  category: CategoryDefinition | null
  refreshRows: RefreshCategoryRows
  setMessage: SetCategoryMessage
}) {
  const [deletingItem, setDeletingItem] = useState<CategorySummaryItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function open(row: CategorySummaryItem) {
    if (category?.table !== 'cutting_discs') return
    setMessage(null)
    setDeletingItem(row)
  }

  function close() {
    if (isDeleting) return
    setDeletingItem(null)
  }

  async function confirm() {
    if (category?.table !== 'cutting_discs' || !deletingItem) return

    setIsDeleting(true)
    setMessage(null)
    try {
      const result = await deleteCuttingDisc(String(deletingItem.item_id))
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
        return
      }

      await refreshRows()
      setDeletingItem(null)
      setMessage({ type: 'success', text: 'تم حذف الصاروخ نهائيًا' })
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
