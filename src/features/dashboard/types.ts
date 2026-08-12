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
  key: string
  label: string
  route: string
  table: string
  rowCount: number
  categoryId?: string | null
}

export type DashboardInventoryRow = {
  id: string
  itemId: string
  internalCode: string | null
  code: string | null
  typeName: string | null
  supplierName: string | null
  receivedBy: string | null
  receivedDate: string | null
  scrappedDate: string | null
  categoryKey: CategoryKey | 'dynamic'
  categoryId: string | null
  categoryLabel: string
  itemName: string
  projectName: string | null
  updatedAt: string | null
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
}
