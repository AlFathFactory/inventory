export type EmployeeCustodyRecord = {
  id: string
  employeeId: string
  tableName: string
  itemId: string
  sourceIssueOperationId: string | null
  quantity: number
  receivedDate: string
  scrappedDate: string | null
  scrapReason: string | null
  notes: string | null
  itemName: string
  itemCode: string | null
  categoryName: string | null
  projectName: string | null
  itemDetails: Record<string, unknown>
}

export type CustodyIssueCandidate = {
  operationId: string
  tableName: string
  itemId: string
  itemName: string
  itemCode: string | null
  categoryName: string | null
  projectName: string | null
  projectId: string | null
  quantity: number
  operationDate: string
  createdAt: string | null
  returnedQuantity: number
  returnStatus: string | null
}

export type CustodyInventoryItem = {
  tableName: string
  itemId: string
  itemName: string
  internalCode: string | null
  categoryName: string
  projectName: string | null
  currentStock: number | null
  details: Record<string, unknown>
}

export type AddEmployeeCustodyInput = {
  employeeId: string
  tableName: string
  itemId: string
  receivedDate: string
  sourceIssueOperationId: string | null
  quantity: number
  notes?: string | null
  createdBy?: string
}

export type ScrapEmployeeCustodyInput = {
  custodyId: string
  scrappedDate: string
  reason: string
  scrappedBy?: string
}

export type CustodyFilter = 'all' | 'active' | 'scrapped'
