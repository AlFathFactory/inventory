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

export type DashboardInventoryAlert = {
  id: string
  category: string
  itemName: string
  stockBalance: number
  minQuantity: number
  status: 'out' | 'low' | 'safe'
  actionLabel: string
}

export type DashboardOperation = {
  id: string
  date: string
  operationType: string
  itemName: string
  quantity: number
  userName: string
}

export type DashboardData = {
  stats: DashboardStats
  alerts: DashboardInventoryAlert[]
  recentOperations: DashboardOperation[]
  categoryCards: CategoryCard[]
  isDemo: boolean
}
