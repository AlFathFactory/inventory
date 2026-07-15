import { categoryConfig } from '../config/categoryConfig'
import {
  offlineDb,
  type CachedInventoryItem,
  type CachedProject,
  type OfflineCacheMetadata,
} from '../lib/offlineDb'
import { supabaseClient } from '../lib/supabaseClient'
import type { CategorySummaryItem } from './itemsService'
import type { Project } from './projectsService'
import { getStockStatusFromValues, getStockStatusLabel } from '../utils/statusUtils'

const pageSize = 1000
let activePreparation: Promise<void> | null = null

function nullableText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

async function fetchAllRows(tableName: string, orderColumn: string) {
  if (!supabaseClient) throw new Error('Supabase غير مهيأ')
  const rows: Record<string, unknown>[] = []
  while (true) {
    const query = supabaseClient.from(tableName).select('*')
    const orderedQuery = tableName === 'inventory_category_items_summary_view'
      ? query.order('table_name', { ascending: true }).order(orderColumn, { ascending: true })
      : query.order(orderColumn, { ascending: true })
    const { data, error } = await orderedQuery.range(rows.length, rows.length + pageSize - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as Record<string, unknown>[]
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

function toCachedItem(raw: Record<string, unknown>, tableName?: string): CachedInventoryItem {
  const resolvedTable = tableName ?? String(raw.table_name ?? '')
  const category = Object.values(categoryConfig).find((entry) => entry.table === resolvedTable)
  const itemId = String(raw.item_id ?? raw.id ?? '')
  const itemNameField = String(category?.itemNameField ?? 'item_name')
  return {
    id: `${resolvedTable}:${itemId}`,
    tableName: resolvedTable,
    itemId,
    internalCode: nullableText(raw.internal_code),
    itemName: nullableText(raw[itemNameField] ?? raw.item_name ?? raw.type_name),
    projectName: nullableText(raw.project_name ?? raw.project),
    materialSource: nullableText(raw.material_source),
    stockBalance: nullableNumber(raw.stock_balance ?? raw.gas_balance),
    minQuantity: nullableNumber(raw.min_quantity),
    supplierName: nullableText(raw.supplier_name),
    raw,
    updatedAt: nullableText(raw.updated_at),
    cachedAt: '',
  }
}

function toCachedProject(raw: Record<string, unknown>, cachedAt: string): CachedProject {
  return {
    id: String(raw.id), name: String(raw.name ?? ''),
    code: nullableText(raw.code), status: String(raw.status ?? 'active'),
    raw, cachedAt,
  }
}

async function performPreparation() {
  if (!navigator.onLine) throw new Error('لا يمكن تجهيز البيانات بدون اتصال بالإنترنت')
  if (!supabaseClient) throw new Error('Supabase غير مهيأ')
  const previousMetadata = await offlineDb.offline_cache_metadata.get('bootstrap')
  await offlineDb.offline_cache_metadata.put({
    key: 'bootstrap', status: 'preparing', updatedAt: previousMetadata?.updatedAt ?? null, errorMessage: null,
  })
  try {
    const [summaryRows, cuttingDiscs, weldingGloves, projects] = await Promise.all([
      fetchAllRows('inventory_category_items_summary_view', 'item_id'),
      fetchAllRows('cutting_discs', 'id'),
      fetchAllRows('long_welding_gloves', 'id'),
      fetchAllRows('projects', 'id'),
    ])
    const cachedAt = new Date().toISOString()
    const items = [
      ...summaryRows.map((row) => toCachedItem(row)),
      ...cuttingDiscs.map((row) => toCachedItem(row, 'cutting_discs')),
      ...weldingGloves.map((row) => toCachedItem(row, 'long_welding_gloves')),
    ].map((item) => ({ ...item, cachedAt }))
    const cachedProjects = projects.map((row) => toCachedProject(row, cachedAt))
    await offlineDb.transaction(
      'rw',
      offlineDb.cached_inventory_items,
      offlineDb.cached_projects,
      offlineDb.offline_cache_metadata,
      async () => {
        await offlineDb.cached_inventory_items.clear()
        await offlineDb.cached_projects.clear()
        await offlineDb.cached_inventory_items.bulkPut(items)
        await offlineDb.cached_projects.bulkPut(cachedProjects)
        await offlineDb.offline_cache_metadata.put({
          key: 'bootstrap', status: 'ready', updatedAt: cachedAt, errorMessage: null,
        })
      },
    )
  } catch (error) {
    const metadata: OfflineCacheMetadata = {
      key: 'bootstrap', status: 'failed', updatedAt: previousMetadata?.updatedAt ?? null,
      errorMessage: error instanceof Error ? error.message : 'تعذر تجهيز البيانات المحلية',
    }
    await offlineDb.offline_cache_metadata.put(metadata)
    throw error
  }
}

export function prepareOfflineData() {
  if (activePreparation) return activePreparation
  activePreparation = performPreparation().finally(() => { activePreparation = null })
  return activePreparation
}

export async function getCachedCategoryRows(tableName: string): Promise<CategorySummaryItem[]> {
  const records = await offlineDb.cached_inventory_items.where('tableName').equals(tableName).toArray()
  return records.map((record) => {
    const stockStatus = getStockStatusFromValues(record.stockBalance, record.minQuantity)
    return {
      ...record.raw,
      table_name: record.tableName,
      item_id: record.itemId,
      internal_code: record.internalCode,
      item_name: record.itemName,
      type_name: record.raw.type_name ?? record.itemName,
      project_name: record.projectName,
      project: record.raw.project ?? record.projectName,
      material_source: record.materialSource,
      stock_balance: record.stockBalance,
      min_quantity: record.minQuantity,
      supplier_name: record.supplierName,
      item_key: record.raw.item_key as string | null ?? null,
      status: stockStatus ? getStockStatusLabel(stockStatus) : null,
      total_added: record.raw.total_added as number | null ?? null,
      total_issued: record.raw.total_issued as number | null ?? null,
      source_rows_count: record.raw.source_rows_count as number | null ?? 1,
      updated_at: record.updatedAt,
      created_at: record.raw.created_at as string | null ?? null,
    } as CategorySummaryItem
  })
}

export async function getCachedProjects(activeOnly = false): Promise<Project[]> {
  const records = activeOnly
    ? await offlineDb.cached_projects.where('status').equals('active').sortBy('name')
    : await offlineDb.cached_projects.orderBy('name').toArray()
  return records.map((record) => ({
    ...record.raw, id: record.id, name: record.name, code: record.code,
    status: record.status === 'inactive' ? 'inactive' : 'active',
  } as Project))
}
