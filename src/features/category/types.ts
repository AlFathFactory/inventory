import type { CategorySummaryItem } from '../../services/itemsService'

export type CategoryMessage = {
  type: 'success' | 'error'
  text: string
} | null

export type CategoryQuickAction = 'add' | 'issue' | null

export type SelectedInventoryItem = CategorySummaryItem & {
  id: string | number
  itemId: string | number
  tableName: string
  itemName: string | null
  projectName: string | null
  categoryName: string
}
