import { categoryConfig } from '../config/categoryConfig'
import {
  offlineDb,
  type CachedInventoryItem,
  type CachedParty,
  type CachedPartyKind,
  type CachedProject,
  type OfflineCacheMetadata,
} from '../lib/offlineDb'
import { supabaseClient } from '../lib/supabaseClient'
import type { CategorySummaryItem } from './itemsService'
import type { Project } from './projectsService'
import { getStockStatusFromValues, getStockStatusLabel } from '../utils/statusUtils'
import { requireSupabaseReachability } from './connectivityService'
import { isInventoryTable } from './inventoryTablePolicy'

const pageSize = 1000
let activePreparation: Promise<void> | null = null
let activePartyRefresh: Promise<void> | null = null

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

async function fetchActiveParties(kind: CachedPartyKind) {
  if (!supabaseClient) throw new Error('Supabase غير مهيأ')
  const tableName = kind === 'employee' ? 'employees' : 'suppliers'
  const rows: Record<string, unknown>[] = []
  while (true) {
    const { data, error } = await supabaseClient
      .from(tableName)
      .select(kind === 'employee'
        ? 'id, name, employee_code, department, phone, is_active'
        : 'id, name, supplier_code, contact_person, phone, is_active')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(rows.length, rows.length + pageSize - 1)
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

function normalizePartyName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar')
}

function toCachedParty(
  raw: Record<string, unknown>,
  kind: CachedPartyKind,
  cachedAt: string,
): CachedParty {
  const id = String(raw.id)
  const name = String(raw.name ?? '').trim()
  return {
    cacheKey: `${kind}:${id}`,
    id,
    kind,
    name,
    normalizedName: normalizePartyName(name),
    code: nullableText(kind === 'employee' ? raw.employee_code : raw.supplier_code),
    detail: nullableText(kind === 'employee' ? raw.department : raw.contact_person),
    phone: nullableText(raw.phone),
    isActive: raw.is_active !== false,
    cachedAt,
  }
}

export async function cachePartyRecords(
  kind: CachedPartyKind,
  rows: Record<string, unknown>[],
) {
  const cachedAt = new Date().toISOString()
  const records = rows.map((row) => toCachedParty(row, kind, cachedAt))
  if (records.length > 0) await offlineDb.cached_parties.bulkPut(records)
}

async function performPartyRefresh() {
  await requireSupabaseReachability()
  const [employees, suppliers] = await Promise.all([
    fetchActiveParties('employee'),
    fetchActiveParties('supplier'),
  ])
  const cachedAt = new Date().toISOString()
  const records = [
    ...employees.map((row) => toCachedParty(row, 'employee', cachedAt)),
    ...suppliers.map((row) => toCachedParty(row, 'supplier', cachedAt)),
  ]
  await offlineDb.transaction('rw', offlineDb.cached_parties, async () => {
    await offlineDb.cached_parties.clear()
    if (records.length > 0) await offlineDb.cached_parties.bulkPut(records)
  })
}

export function refreshCachedParties() {
  if (activePartyRefresh) return activePartyRefresh
  activePartyRefresh = performPartyRefresh().finally(() => { activePartyRefresh = null })
  return activePartyRefresh
}

async function assertSnapshotCanBeReplaced() {
  const [unresolvedItems, unresolvedOperations] = await Promise.all([
    offlineDb.offline_items.filter((item) => item.status !== 'synced').count(),
    offlineDb.offline_operations.filter((operation) => operation.status !== 'synced').count(),
  ])
  if (unresolvedItems + unresolvedOperations > 0) {
    throw new Error('يجب رفع أو معالجة التغييرات المحلية السابقة قبل تجهيز جلسة جديدة.')
  }
}

async function performPreparation() {
  await requireSupabaseReachability()
  if (!supabaseClient) throw new Error('Supabase غير مهيأ')
  await assertSnapshotCanBeReplaced()
  const previousMetadata = await offlineDb.offline_cache_metadata.get('bootstrap')
  await offlineDb.offline_cache_metadata.put({
    key: 'bootstrap', status: 'preparing', updatedAt: previousMetadata?.updatedAt ?? null, errorMessage: null,
  })
  try {
    const [summaryRows, paints, cuttingDiscs, weldingGloves, projects, employees, suppliers] = await Promise.all([
      fetchAllRows('inventory_category_items_summary_view', 'item_id'),
      fetchAllRows('paints', 'id'),
      fetchAllRows('cutting_discs', 'id'),
      fetchAllRows('long_welding_gloves', 'id'),
      fetchAllRows('projects', 'id'),
      fetchActiveParties('employee'),
      fetchActiveParties('supplier'),
    ])
    const cachedAt = new Date().toISOString()
    const paintProductionDates = new Map(
      paints.map((row) => [String(row.id), row.production_date ?? null]),
    )
    const enrichedSummaryRows = summaryRows.map((row) => row.table_name === 'paints'
      ? {
          ...row,
          production_date: paintProductionDates.get(String(row.item_id)) ?? null,
        }
      : row)
    const items = [
      ...enrichedSummaryRows.map((row) => toCachedItem(row)),
      ...cuttingDiscs.map((row) => toCachedItem(row, 'cutting_discs')),
      ...weldingGloves.map((row) => toCachedItem(row, 'long_welding_gloves')),
    ].map((item) => ({ ...item, cachedAt }))
    const cachedProjects = projects.map((row) => toCachedProject(row, cachedAt))
    const cachedParties = [
      ...employees.map((row) => toCachedParty(row, 'employee', cachedAt)),
      ...suppliers.map((row) => toCachedParty(row, 'supplier', cachedAt)),
    ]
    await offlineDb.transaction(
      'rw',
      offlineDb.cached_inventory_items,
      offlineDb.cached_projects,
      offlineDb.cached_parties,
      offlineDb.offline_cache_metadata,
      async () => {
        await offlineDb.cached_inventory_items.clear()
        await offlineDb.cached_projects.clear()
        await offlineDb.cached_parties.clear()
        await offlineDb.cached_inventory_items.bulkPut(items)
        await offlineDb.cached_projects.bulkPut(cachedProjects)
        await offlineDb.cached_parties.bulkPut(cachedParties)
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

function mapCachedInventoryItem(record: CachedInventoryItem): CategorySummaryItem {
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
}

export async function getCachedCategoryRows(tableName: string): Promise<CategorySummaryItem[]> {
  const records = await offlineDb.cached_inventory_items.where('tableName').equals(tableName).toArray()
  return records.map(mapCachedInventoryItem)
}

export async function getCachedInventoryItem(tableName: string, itemId: string) {
  const record = await offlineDb.cached_inventory_items
    .where('[tableName+itemId]')
    .equals([tableName, itemId])
    .first()
  return record ? mapCachedInventoryItem(record) : null
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

export async function getCachedPartyRecords(kind: CachedPartyKind) {
  return offlineDb.cached_parties.where('kind').equals(kind).sortBy('name')
}

export async function refreshCachedInventoryItems(
  references: Array<{ tableName: string; itemId: string }>,
) {
  if (!supabaseClient || !navigator.onLine || references.length === 0) return
  const client = supabaseClient
  const grouped = new Map<string, Set<string>>()
  references.forEach(({ tableName, itemId }) => {
    if (!isInventoryTable(tableName)) return
    const ids = grouped.get(tableName) ?? new Set<string>()
    ids.add(itemId)
    grouped.set(tableName, ids)
  })
  const cachedAt = new Date().toISOString()
  const refreshed = (await Promise.all([...grouped].map(async ([tableName, ids]) => {
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .in('id', [...ids])
    if (error) throw new Error(error.message)
    return ((data ?? []) as Record<string, unknown>[])
      .map((row) => ({ ...toCachedItem(row, tableName), cachedAt }))
  }))).flat()
  if (refreshed.length > 0) await offlineDb.cached_inventory_items.bulkPut(refreshed)
}
