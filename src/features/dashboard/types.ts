import type { CategoryKey } from '../../config/categoryConfig'

export type DashboardStats = {
  totalCategories: number
  totalImportedFiles: number
  totalMainRows: number
  lowStockItemsCount: number
  outOfStockItemsCount: number
  lastImportedFile: string | null
}

export type CategoryCard = {
  key: CategoryKey
  label: string
  route: string
  table: string
  rowCount: number
}

export type DashboardInventoryRow = {
  id: string
  itemId: string
  categoryKey: CategoryKey
  categoryLabel: string
  itemName: string
  projectName: string | null
  dateValue: string | null
  dateLabel: string
  addedQuantity: number | null
  issuedQuantity: number | null
  stockBalance: number | null
  minQuantity: number | null
  status: 'out' | 'low' | 'safe' | null
  searchText: string
}

export type DashboardData = {
  stats: DashboardStats
  inventoryRows: DashboardInventoryRow[]
  categoryCards: CategoryCard[]
  isDemo: boolean
}
