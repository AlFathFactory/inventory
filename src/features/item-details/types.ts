export type ItemDetailsMessage = {
  type: 'success' | 'error'
  text: string
} | null

export type ItemMovementsDateFilterValue = {
  fromDate: string
  toDate: string
}

export type MonthlyMovementSummary = {
  monthKey: string
  monthLabel: string
  totalAdded: number
  totalIssued: number
}
