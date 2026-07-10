import type { StockStatus } from '../../utils/statusUtils'

export type ItemActionType = 'add' | 'issue'

export type ItemActionOption = {
  id: ItemActionType
  title: string
  hint: string
}

export type ItemInventoryRow = {
  id: string
  category: string
  itemName: string
  project: string
  stockBalance: number
  minQuantity: number
  updatedAt: string
  status: StockStatus
}

export type ItemEditorValues = {
  category: string
  project: string
  itemName: string
  unit: string
  stockBalance: string
  minQuantity: string
}

export type ItemFilterValues = {
  search: string
  category: string
  status: 'all' | StockStatus
}

export type ItemSelectOption = {
  value: string
  label: string
}
