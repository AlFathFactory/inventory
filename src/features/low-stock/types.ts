import type { CategoryKey } from '../../config/categoryConfig'
import type { ExpiryAlertStatus } from '../../utils/expiryStatus'
import type { StockStatus } from '../../utils/statusUtils'

export type AlertStatus = Exclude<StockStatus, 'safe'> | ExpiryAlertStatus
export type AlertStatusFilter = 'all' | AlertStatus

export type LowStockRow = {
  id: string
  itemId: string
  categoryKey: CategoryKey | 'dynamic'
  categoryId: string | null
  categoryLabel: string
  itemName: string
  projectName: string | null
  dateValue: string | null
  dateLabel: string
  expiryDateLabel: string
  stockBalance: number | null
  minQuantity: number | null
  status: AlertStatus
  searchText: string
}

export type LowStockState = {
  rows: LowStockRow[]
  isLoading: boolean
  error: string | null
}
