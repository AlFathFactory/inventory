import type { CategoryDefinition } from '../../../config/categoryConfig'
import {
  getCategorySummaryItems,
  getCustodyCategoryRows,
  isCustodyTable,
  type CategorySummaryItem,
} from '../../../services/itemsService'
import {
  listLongWeldingGloves,
  type LongWeldingGloveRecord,
} from '../../../services/longWeldingGlovesService'
import {
  listCuttingDiscs,
  type CuttingDiscRecord,
} from '../../../services/cuttingDiscsService'

function mapGloveRows(rows: LongWeldingGloveRecord[] | null): CategorySummaryItem[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    internal_code: row.internal_code,
    supplier_name: row.supplier_name,
    type_name: row.type_name,
    received_by: row.received_by,
    received_date: row.received_date,
    notes: row.notes,
    table_name: 'long_welding_gloves',
    category_name: 'جوانتي لحام طويل',
    item_id: row.id,
    item_key: null,
    project_name: null,
    item_name: row.type_name,
    stock_balance: null,
    min_quantity: null,
    status: null,
    total_added: null,
    total_issued: null,
    source_rows_count: 1,
    updated_at: null,
    created_at: null,
  }))
}

function mapCuttingDiscRows(rows: CuttingDiscRecord[] | null): CategorySummaryItem[] {
  return (rows ?? []).map((row) => ({
    ...row,
    table_name: 'cutting_discs',
    category_name: 'صواريخ',
    item_id: row.id,
    item_key: null,
    project_name: null,
    item_name: row.type_name,
    stock_balance: null,
    min_quantity: null,
    status: null,
    total_added: null,
    total_issued: null,
    source_rows_count: 1,
  }))
}

export async function loadCategoryRows(category: CategoryDefinition) {
  if (category.table === 'cutting_discs') {
    const result = await listCuttingDiscs()
    return {
      data: result.error ? [] : mapCuttingDiscRows(result.data),
      error: result.error,
    }
  }

  if (category.table === 'long_welding_gloves') {
    const result = await listLongWeldingGloves()
    return {
      data: result.error ? [] : mapGloveRows(result.data),
      error: result.error,
    }
  }

  const result = isCustodyTable(category.table)
    ? await getCustodyCategoryRows(category.table)
    : await getCategorySummaryItems(category.table)

  return {
    data: (result.data ?? []) as CategorySummaryItem[],
    error: result.error,
  }
}

const searchableFields: Array<keyof CategorySummaryItem> = [
  'internal_code',
  'project_name',
  'project',
  'item_name',
  'status',
  'material_source',
  'supplier_name',
  'din',
  'code_number',
  'weight',
  'length',
  'width',
  'th',
  'code',
  'type_name',
  'received_by',
  'received_date',
  'scrapped_date',
  'source_sheet',
]

export function filterCategoryRows(
  rows: CategorySummaryItem[],
  searchTerm: string,
) {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()

  if (!normalizedSearchTerm) {
    return rows
  }

  return rows.filter((row) =>
    searchableFields.some((field) =>
      String(row[field] ?? '').toLowerCase().includes(normalizedSearchTerm),
    ),
  )
}

export function filterCategoryRowsByProject(
  rows: CategorySummaryItem[],
  selectedProjectName: string,
) {
  if (!selectedProjectName) return rows
  return rows.filter(
    (row) => (row.project_name ?? row.project ?? '') === selectedProjectName,
  )
}
