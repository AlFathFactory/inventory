export type StockTableName =
  | 'consumables'
  | 'paints'
  | 'screws'
  | 'stock_screws'
  | 'raw_materials'
  | 'cylinders'

export type CustomExcelSource = {
  file_name: string
  sheet: string
  row: number
  column?: number
}

export type CustomInventoryFields = {
  internal_code?: string
  din?: string
  code_number?: string
  weight?: number | null
  length?: number | null
  width?: number | null
  th?: number | null
  dimension_text?: string | null
  material_source?: string
  production_date?: string | null
  expire_date?: string | null
  empty_count?: number | null
  full_count?: number | null
  notes?: string | null
}

export type CustomInventoryItem = {
  client_key: string
  table_name: StockTableName
  item_key: string
  project_name: string
  item_name: string
  type_name?: string
  opening_balance: number
  total_added: number
  total_issued: number
  stock_balance: number
  min_quantity?: number
  transaction_date: string
  source: CustomExcelSource
  fields: CustomInventoryFields
  notes?: string
}

export type CustomInventoryMovement = {
  table_name: StockTableName
  item_key: string
  project_name: string
  category_name: string
  item_name: string
  operation_type: 'add' | 'issue' | 'adjust'
  operation_date: string
  quantity: number
  previous_balance: number
  new_balance: number
  import_key: string
  notes?: string
  source: CustomExcelSource
}

export type InventoryMatchStatus = 'matched' | 'ambiguous' | 'not_found'

export type InventoryItemMatch = {
  status: InventoryMatchStatus
  item_id: string | null
  match_method: string | null
  match_count: number
  candidate_ids?: string[]
}

export type InventoryMatchResultRow = {
  client_key: string
  table_name: string
  item_key: string
  match: InventoryItemMatch
}

export type InventoryMatchedItem = {
  sourceItem: CustomInventoryItem
  itemId: string
  matchMethod: string
}

export type InventoryAmbiguousItem = {
  sourceItem: CustomInventoryItem
  candidateIds: string[]
  matchMethod: string | null
}

export type InventoryMatchingSummary = {
  matched: InventoryMatchedItem[]
  newItems: CustomInventoryItem[]
  ambiguous: InventoryAmbiguousItem[]
  newMovementsCount: number
  duplicateMovementsCount: number
}

export type CustomCuttingDisc = {
  code: string | null
  type_name: string
  received_by: string | null
  received_date: string | null
  scrapped_date: string | null
  notes?: string | null
  source_file: string
  source_sheet: string
  source_row: number
}

export type CustomWeldingGlove = {
  type_name: string
  received_by: string
  received_date: string | null
  quantity: number
  notes?: string | null
  source_file: string
  source_sheet: string
  source_row: number
}

export type CustomSheetDiagnosis = {
  sheetName: string
  detectedType: string | null
  itemCount: number
  movementCount: number
  skippedRows: number
  warnings: string[]
}

export type CustomExcelPreview = {
  kind: 'custom-excel'
  fileName: string
  items: CustomInventoryItem[]
  movements: CustomInventoryMovement[]
  cuttingDiscs: CustomCuttingDisc[]
  longWeldingGloves: CustomWeldingGlove[]
  errors: string[]
  warnings: string[]
  ignoredSheets: string[]
  duplicateItemsCount: number
  duplicateMovementsCount: number
  matching?: InventoryMatchingSummary
  sheetDiagnoses?: CustomSheetDiagnosis[]
}

export type SheetParseResult = {
  items: CustomInventoryItem[]
  movements: CustomInventoryMovement[]
  cuttingDiscs: CustomCuttingDisc[]
  longWeldingGloves: CustomWeldingGlove[]
  errors: string[]
  warnings: string[]
  skippedRows: number
}
