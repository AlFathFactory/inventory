import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'
import type {
  CustomCuttingDisc,
  CustomExcelPreview,
  CustomInventoryItem,
  CustomInventoryMovement,
  CustomWeldingGlove,
  InventoryItemMatch,
  InventoryMatchingSummary,
  InventoryMatchResultRow,
  StockTableName,
} from '../utils/customExcelParser'
import type { InventoryImportResult, ServiceResult } from './inventoryService'

export const CUSTOM_IMPORT_CHUNK_SIZES = {
  matching: 100,
  items: 100,
  movements: 150,
  custody: 100,
} as const

const RPC_TIMEOUT_MS = 60_000
const STOCK_TABLES: readonly StockTableName[] = [
  'consumables',
  'paints',
  'screws',
  'stock_screws',
  'raw_materials',
  'cylinders',
]

export type CustomImportStage =
  | 'matching'
  | 'items'
  | 'movements'
  | 'cutting_discs'
  | 'long_welding_gloves'
  | 'internal_codes'
  | 'complete'

export type CustomImportProgress = {
  stage: CustomImportStage
  label: string
  current: number
  total: number
  chunk: number
  totalChunks: number
}

type ItemNeedingCode = {
  table_name: StockTableName
  item_id: string
}

type ItemWriteResult = {
  clientKey: string
  tableName: StockTableName
  itemKey: string
  itemId: string
  action: 'inserted' | 'updated'
}

type ChunkCounts = {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
  itemsNeedingCodes: ItemNeedingCode[]
  itemResults: ItemWriteResult[]
}

export type CustomImportGateway = {
  runRpc: (functionName: string, args: Record<string, unknown>) => Promise<unknown>
  generateInternalCode: (item: ItemNeedingCode) => Promise<void>
  refreshInventory: () => Promise<string[]>
  saveSummary: (preview: CustomExcelPreview, result: InventoryImportResult) => Promise<string | null>
}

class MatchingChunkError extends Error {
  readonly chunk: number

  constructor(chunk: number, message: string) {
    super(message)
    this.chunk = chunk
  }
}

export function chunkArray<T>(values: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) throw new Error('Chunk size must be a positive integer.')
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

function toCount(value: unknown) {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : 0
}

function stringifyError(error: unknown) {
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function isStockTable(value: unknown): value is StockTableName {
  return STOCK_TABLES.includes(value as StockTableName)
}

export function parseChunkCounts(data: unknown): ChunkCounts {
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== 'object') {
    return { inserted: 0, updated: 0, skipped: 0, errors: [], itemsNeedingCodes: [], itemResults: [] }
  }

  const record = value as Record<string, unknown>
  const rawErrors = Array.isArray(record.errors) ? record.errors : []
  const rawCodeItems = Array.isArray(record.items_needing_codes) ? record.items_needing_codes : []
  const rawItemResults = Array.isArray(record.item_results) ? record.item_results : []
  const itemsNeedingCodes = rawCodeItems.flatMap<ItemNeedingCode>((item) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Record<string, unknown>
    const tableName = candidate.table_name
    const itemId = String(candidate.item_id ?? '')
    return isStockTable(tableName) && itemId ? [{ table_name: tableName, item_id: itemId }] : []
  })
  const itemResults = rawItemResults.flatMap<ItemWriteResult>((item) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Record<string, unknown>
    const tableName = candidate.table_name
    const itemId = String(candidate.item_id ?? '')
    const clientKey = String(candidate.client_key ?? '')
    const action = candidate.action
    if (!isStockTable(tableName) || !itemId || !clientKey || (action !== 'inserted' && action !== 'updated')) return []
    return [{
      clientKey,
      tableName,
      itemKey: String(candidate.item_key ?? ''),
      itemId,
      action,
    }]
  })

  return {
    inserted: toCount(record.inserted ?? record.inserted_items),
    updated: toCount(record.updated ?? record.updated_items),
    skipped: toCount(record.skipped ?? record.skipped_items),
    errors: rawErrors.map(stringifyError),
    itemsNeedingCodes,
    itemResults,
  }
}

export function prepareItem(
  item: CustomInventoryItem,
  resolution?: { resolvedItemId?: string; matchStatus?: 'matched' | 'not_found' },
): Record<string, unknown> {
  const fields = {
    ...item.fields,
    internal_code: item.fields.internal_code?.trim() || null,
    din: item.fields.din?.trim() || null,
    code_number: item.fields.code_number?.trim() || null,
  }
  return {
    ...item,
    internal_code: fields.internal_code,
    din: fields.din,
    code_number: fields.code_number,
    material_source: fields.material_source ?? null,
    length: fields.length ?? null,
    width: fields.width ?? null,
    th: fields.th ?? null,
    weight: fields.weight ?? null,
    dimension_text: fields.dimension_text ?? null,
    fields,
    resolved_item_id: resolution?.resolvedItemId ?? null,
    match_status: resolution?.matchStatus ?? null,
  }
}

export function prepareMovement(
  movement: CustomInventoryMovement,
  resolvedItemId?: string,
): Record<string, unknown> {
  return { ...movement, resolved_item_id: resolvedItemId ?? null }
}

function prepareCuttingDisc(record: CustomCuttingDisc): Record<string, unknown> {
  return { ...record }
}

function prepareWeldingGlove(record: CustomWeldingGlove): Record<string, unknown> {
  return { ...record }
}

function stageLabel(stage: CustomImportStage) {
  const labels: Record<CustomImportStage, string> = {
    matching: 'مطابقة الأصناف مع قاعدة البيانات',
    items: 'استيراد الأصناف',
    movements: 'استيراد حركات يوليو',
    cutting_discs: 'استيراد عهدة الصواريخ',
    long_welding_gloves: 'استيراد عهدة جوانتي اللحام',
    internal_codes: 'إنشاء الأكواد الداخلية للأصناف الجديدة',
    complete: 'اكتمل الاستيراد',
  }
  return labels[stage]
}

function emitProgress(
  onProgress: ((progress: CustomImportProgress) => void) | undefined,
  stage: CustomImportStage,
  current: number,
  total: number,
  chunk: number,
  totalChunks: number,
) {
  onProgress?.({ stage, label: stageLabel(stage), current, total, chunk, totalChunks })
}

function parseMatchRows(data: unknown): InventoryMatchResultRow[] {
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== 'object') throw new Error('استجابة مطابقة الأصناف غير صالحة.')
  const results = (value as Record<string, unknown>).results
  if (!Array.isArray(results)) throw new Error('استجابة مطابقة الأصناف لا تحتوي على النتائج.')

  return results.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('صف مطابقة غير صالح.')
    const row = entry as Record<string, unknown>
    const rawMatch = row.match
    if (!rawMatch || typeof rawMatch !== 'object') throw new Error('نتيجة مطابقة صنف غير صالحة.')
    const match = rawMatch as Record<string, unknown>
    const status = match.status
    if (!['matched', 'ambiguous', 'not_found'].includes(String(status))) throw new Error('حالة مطابقة غير معروفة.')
    const clientKey = String(row.client_key ?? '')
    if (!clientKey) throw new Error('نتيجة المطابقة لا تحتوي على client_key.')
    return {
      client_key: clientKey,
      table_name: String(row.table_name ?? ''),
      item_key: String(row.item_key ?? ''),
      match: {
        status: status as InventoryItemMatch['status'],
        item_id: match.item_id ? String(match.item_id) : null,
        match_method: match.match_method ? String(match.match_method) : null,
        match_count: toCount(match.match_count),
        candidate_ids: Array.isArray(match.candidate_ids) ? match.candidate_ids.map(String) : undefined,
      },
    }
  })
}

export async function matchInventoryItems(
  items: CustomInventoryItem[],
  onProgress?: (progress: CustomImportProgress) => void,
  gateway: CustomImportGateway = createSupabaseGateway(),
): Promise<InventoryMatchingSummary> {
  const byClientKey = new Map(items.map((item) => [item.client_key, item]))
  if (byClientKey.size !== items.length || byClientKey.has('')) {
    throw new Error('تعذر المطابقة: client_key مفقود أو مكرر داخل ملف Excel.')
  }

  const chunks = chunkArray(items, CUSTOM_IMPORT_CHUNK_SIZES.matching)
  const rows: InventoryMatchResultRow[] = []
  if (chunks.length === 0) emitProgress(onProgress, 'matching', 0, 0, 0, 0)
  for (let index = 0; index < chunks.length; index += 1) {
    const chunkNumber = index + 1
    emitProgress(onProgress, 'matching', index * CUSTOM_IMPORT_CHUNK_SIZES.matching, items.length, chunkNumber, chunks.length)
    try {
      const response = await gateway.runRpc('match_inventory_items_chunk_rpc', {
        p_items: chunks[index].map((item) => prepareItem(item)),
      })
      rows.push(...parseMatchRows(response))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new MatchingChunkError(chunkNumber, `فشلت مطابقة الأصناف في الحزمة ${chunkNumber}: ${message}`)
    }
    emitProgress(onProgress, 'matching', Math.min(chunkNumber * CUSTOM_IMPORT_CHUNK_SIZES.matching, items.length), items.length, chunkNumber, chunks.length)
  }

  if (rows.length !== items.length) throw new Error(`عدد نتائج المطابقة (${rows.length}) لا يساوي عدد الأصناف (${items.length}).`)
  const seen = new Set<string>()
  const summary: InventoryMatchingSummary = {
    matched: [],
    newItems: [],
    ambiguous: [],
    newMovementsCount: 0,
    duplicateMovementsCount: 0,
  }
  for (const row of rows) {
    if (seen.has(row.client_key)) throw new Error(`تكررت نتيجة المطابقة للمفتاح ${row.client_key}.`)
    seen.add(row.client_key)
    const sourceItem = byClientKey.get(row.client_key)
    if (!sourceItem) throw new Error(`أعادت قاعدة البيانات client_key غير معروف: ${row.client_key}.`)
    if (row.table_name !== sourceItem.table_name || row.item_key !== sourceItem.item_key) {
      throw new Error(`نتيجة المطابقة لا تطابق بيانات المصدر للمفتاح ${row.client_key}.`)
    }
    if (row.match.status === 'matched') {
      if (!row.match.item_id) throw new Error(`نتيجة matched لا تحتوي على item_id: ${row.client_key}.`)
      summary.matched.push({
        sourceItem,
        itemId: row.match.item_id,
        matchMethod: row.match.match_method ?? 'unknown',
      })
    } else if (row.match.status === 'ambiguous') {
      summary.ambiguous.push({
        sourceItem,
        candidateIds: row.match.candidate_ids ?? [],
        matchMethod: row.match.match_method,
      })
    } else {
      summary.newItems.push(sourceItem)
    }
  }
  return summary
}

async function findExistingMovementKeys(
  movements: readonly CustomInventoryMovement[],
  gateway: CustomImportGateway,
): Promise<Set<string>> {
  const existing = new Set<string>()
  for (const chunk of chunkArray(movements.map((movement) => movement.import_key), CUSTOM_IMPORT_CHUNK_SIZES.matching)) {
    const response = await gateway.runRpc('match_inventory_movement_keys_chunk_rpc', { p_import_keys: chunk })
    const value = Array.isArray(response) ? response[0] : response
    const keys = value && typeof value === 'object' ? (value as Record<string, unknown>).existing_keys : null
    if (!Array.isArray(keys)) throw new Error('استجابة مطابقة مفاتيح الحركات غير صالحة.')
    keys.forEach((key) => existing.add(String(key)))
  }
  return existing
}

export function formatAmbiguousItemError(entry: InventoryMatchingSummary['ambiguous'][number]) {
  const item = entry.sourceItem
  const identity = [
    item.fields.din ? `DIN: ${item.fields.din}` : '',
    item.fields.code_number ? `الكود: ${item.fields.code_number}` : '',
    item.fields.dimension_text ? `الأبعاد: ${item.fields.dimension_text}` : '',
  ].filter(Boolean).join('، ')
  return [
    'تعذر تحديد الصنف بشكل آمن: يوجد أكثر من صنف مطابق',
    `الشيت: ${item.source.sheet}`,
    `الصف: ${item.source.row}`,
    `الجدول: ${item.table_name}`,
    `القسم: ${item.project_name}`,
    `الصنف: ${item.item_name}`,
    identity,
    `المرشحون: ${entry.candidateIds.join(', ') || 'غير متاح'}`,
  ].filter(Boolean).join(' — ')
}

export async function prepareCustomInventoryPreview(
  preview: CustomExcelPreview,
  onProgress?: (progress: CustomImportProgress) => void,
  gateway: CustomImportGateway = createSupabaseGateway(),
): Promise<CustomExcelPreview> {
  if (preview.errors.length > 0) return preview
  const matching = await matchInventoryItems(preview.items, onProgress, gateway)
  const existingMovementKeys = await findExistingMovementKeys(preview.movements, gateway)
  matching.duplicateMovementsCount = existingMovementKeys.size
  matching.newMovementsCount = preview.movements.length - existingMovementKeys.size
  return {
    ...preview,
    matching,
    errors: [...preview.errors, ...matching.ambiguous.map(formatAmbiguousItemError)],
  }
}

async function importChunks<T>(options: {
  values: readonly T[]
  size: number
  stage: CustomImportStage
  rpcName: string
  buildArgs: (chunk: T[]) => Record<string, unknown>
  gateway: CustomImportGateway
  onProgress?: (progress: CustomImportProgress) => void
  onCounts: (counts: ChunkCounts) => void
  onCompleted: () => void
  beforeChunk: (stage: CustomImportStage, chunk: number) => void
}) {
  const chunks = chunkArray(options.values, options.size)
  if (chunks.length === 0) {
    emitProgress(options.onProgress, options.stage, 0, 0, 0, 0)
    return
  }
  for (let index = 0; index < chunks.length; index += 1) {
    const chunkNumber = index + 1
    options.beforeChunk(options.stage, chunkNumber)
    emitProgress(options.onProgress, options.stage, index * options.size, options.values.length, chunkNumber, chunks.length)
    const counts = parseChunkCounts(await options.gateway.runRpc(options.rpcName, options.buildArgs(chunks[index])))
    options.onCounts(counts)
    if (counts.errors.length > 0) throw new Error(`${stageLabel(options.stage)} - الحزمة ${chunkNumber}: ${counts.errors.join(' | ')}`)
    options.onCompleted()
    emitProgress(options.onProgress, options.stage, Math.min(chunkNumber * options.size, options.values.length), options.values.length, chunkNumber, chunks.length)
  }
}

export async function executeCustomInventoryImport(
  preview: CustomExcelPreview,
  gateway: CustomImportGateway,
  onProgress?: (progress: CustomImportProgress) => void,
): Promise<InventoryImportResult> {
  let insertedItemsCount = 0
  let updatedItemsCount = 0
  let skippedItemsCount = 0
  let insertedMovementsCount = 0
  let updatedMovementsCount = 0
  let skippedMovementsCount = 0
  let insertedCustodyCount = 0
  let updatedCustodyCount = 0
  let skippedCustodyCount = 0
  let completedChunks = 0
  let failedStage: CustomImportStage | null = 'matching'
  let failedChunk: number | null = 1
  let matching: InventoryMatchingSummary | null = null
  const errors: string[] = []
  const codeItems = new Map<string, ItemNeedingCode>()
  const resolvedByItemKey = new Map<string, string>()

  const snapshot = (): InventoryImportResult => {
    const methods = matching?.matched.map((item) => item.matchMethod) ?? []
    return {
      importedRowCount: preview.items.length + preview.movements.length + preview.cuttingDiscs.length + preview.longWeldingGloves.length,
      processedItemCount: insertedItemsCount + updatedItemsCount + skippedItemsCount,
      matchedItemsCount: matching?.matched.length ?? 0,
      newItemsCount: matching?.newItems.length ?? 0,
      ambiguousItemsCount: matching?.ambiguous.length ?? 0,
      matchedByItemKeyCount: methods.filter((method) => method === 'item_key').length,
      matchedByInternalCodeCount: methods.filter((method) => method === 'internal_code').length,
      matchedByBusinessIdentityCount: methods.filter((method) => !['item_key', 'internal_code'].includes(method)).length,
      insertedItemsCount,
      updatedItemsCount,
      skippedItemsCount,
      insertedMovementsCount,
      updatedMovementsCount,
      skippedMovementsCount,
      insertedCustodyCount,
      updatedCustodyCount,
      skippedCustodyCount,
      completedChunks,
      failedStage,
      failedChunk,
      completed: failedStage === null,
      errors,
    }
  }

  const beforeChunk = (stage: CustomImportStage, chunk: number) => {
    failedStage = stage
    failedChunk = chunk
  }

  try {
    matching = await matchInventoryItems(preview.items, onProgress, gateway)
    if (matching.ambiguous.length > 0) {
      errors.push(...matching.ambiguous.map(formatAmbiguousItemError))
      return snapshot()
    }
    matching.matched.forEach((item) => resolvedByItemKey.set(item.sourceItem.item_key, item.itemId))
    const matchedByClientKey = new Map(matching.matched.map((item) => [item.sourceItem.client_key, item]))
    const itemPayloads = [
      ...matching.matched.map((entry) => prepareItem(entry.sourceItem, { resolvedItemId: entry.itemId, matchStatus: 'matched' })),
      ...matching.newItems.map((item) => prepareItem(item, { matchStatus: 'not_found' })),
    ]

    await importChunks({
      values: itemPayloads,
      size: CUSTOM_IMPORT_CHUNK_SIZES.items,
      stage: 'items',
      rpcName: 'import_normalized_items_chunk_rpc',
      buildArgs: (chunk) => ({ p_items: chunk }),
      gateway,
      onProgress,
      beforeChunk,
      onCompleted: () => { completedChunks += 1 },
      onCounts: (counts) => {
        insertedItemsCount += counts.inserted
        updatedItemsCount += counts.updated
        skippedItemsCount += counts.skipped
        counts.itemResults.forEach((result) => resolvedByItemKey.set(result.itemKey, result.itemId))
        counts.itemsNeedingCodes.forEach((item) => codeItems.set(`${item.table_name}:${item.item_id}`, item))
      },
    })

    for (const item of preview.items) {
      if (!resolvedByItemKey.has(item.item_key)) {
        const matched = matchedByClientKey.get(item.client_key)
        if (matched) resolvedByItemKey.set(item.item_key, matched.itemId)
      }
      if (!resolvedByItemKey.has(item.item_key)) throw new Error(`لم يُعد RPC معرفاً للصنف ${item.item_name} (${item.client_key}).`)
    }

    const movementPayloads = preview.movements.map((movement) => {
      const resolvedItemId = resolvedByItemKey.get(movement.item_key)
      if (!resolvedItemId) throw new Error(`تعذر ربط الحركة بالصنف: ${movement.item_name} — ${movement.import_key}`)
      return prepareMovement(movement, resolvedItemId)
    })
    await importChunks({
      values: movementPayloads,
      size: CUSTOM_IMPORT_CHUNK_SIZES.movements,
      stage: 'movements',
      rpcName: 'import_normalized_movements_chunk_rpc',
      buildArgs: (chunk) => ({ p_movements: chunk }),
      gateway,
      onProgress,
      beforeChunk,
      onCompleted: () => { completedChunks += 1 },
      onCounts: (counts) => {
        insertedMovementsCount += counts.inserted
        updatedMovementsCount += counts.updated
        skippedMovementsCount += counts.skipped
      },
    })

    await importChunks({
      values: preview.cuttingDiscs,
      size: CUSTOM_IMPORT_CHUNK_SIZES.custody,
      stage: 'cutting_discs',
      rpcName: 'import_normalized_custody_chunk_rpc',
      buildArgs: (chunk) => ({ p_table_name: 'cutting_discs', p_records: chunk.map(prepareCuttingDisc) }),
      gateway,
      onProgress,
      beforeChunk,
      onCompleted: () => { completedChunks += 1 },
      onCounts: (counts) => {
        insertedCustodyCount += counts.inserted
        updatedCustodyCount += counts.updated
        skippedCustodyCount += counts.skipped
      },
    })

    await importChunks({
      values: preview.longWeldingGloves,
      size: CUSTOM_IMPORT_CHUNK_SIZES.custody,
      stage: 'long_welding_gloves',
      rpcName: 'import_normalized_custody_chunk_rpc',
      buildArgs: (chunk) => ({ p_table_name: 'long_welding_gloves', p_records: chunk.map(prepareWeldingGlove) }),
      gateway,
      onProgress,
      beforeChunk,
      onCompleted: () => { completedChunks += 1 },
      onCounts: (counts) => {
        insertedCustodyCount += counts.inserted
        updatedCustodyCount += counts.updated
        skippedCustodyCount += counts.skipped
      },
    })

    const pendingCodes = [...codeItems.values()]
    if (pendingCodes.length === 0) emitProgress(onProgress, 'internal_codes', 0, 0, 0, 0)
    for (let index = 0; index < pendingCodes.length; index += 1) {
      failedStage = 'internal_codes'
      failedChunk = index + 1
      emitProgress(onProgress, 'internal_codes', index, pendingCodes.length, index + 1, pendingCodes.length)
      await gateway.generateInternalCode(pendingCodes[index])
      emitProgress(onProgress, 'internal_codes', index + 1, pendingCodes.length, index + 1, pendingCodes.length)
      completedChunks += 1
    }

    errors.push(...await gateway.refreshInventory())
    failedStage = null
    failedChunk = null
    const summaryError = await gateway.saveSummary(preview, snapshot())
    if (summaryError) errors.push(`تعذر حفظ ملخص الاستيراد: ${summaryError}`)
    emitProgress(onProgress, 'complete', 1, 1, 1, 1)
    return snapshot()
  } catch (error) {
    if (error instanceof MatchingChunkError) {
      failedStage = 'matching'
      failedChunk = error.chunk
    }
    errors.push(error instanceof Error ? error.message : 'حدث خطأ أثناء استيراد ملف Excel المخصص.')
    return snapshot()
  }
}

type SupabaseRpcResult = { data: unknown; error: { message?: string } | null }

async function withTimeout(request: PromiseLike<SupabaseRpcResult>, operationLabel: string): Promise<SupabaseRpcResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${operationLabel}: انتهت مهلة الاتصال بعد 60 ثانية.`)), RPC_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function createSupabaseGateway(): CustomImportGateway {
  if (!isSupabaseConfigured || !supabaseClient) throw new Error(getSupabaseConfigError())
  const client = supabaseClient
  return {
    async runRpc(functionName, args) {
      const response = await withTimeout(client.rpc(functionName, args as never), functionName)
      if (response.error) throw new Error(response.error.message || `${functionName} failed.`)
      return response.data
    },
    async generateInternalCode(item) {
      const response = await withTimeout(client.rpc('generate_inventory_internal_code_rpc', {
        p_table_name: item.table_name,
        p_item_id: item.item_id,
      } as never), 'generate_inventory_internal_code_rpc')
      if (response.error) throw new Error(response.error.message || 'تعذر إنشاء الكود الداخلي.')
    },
    async refreshInventory() {
      const errors: string[] = []
      for (const view of ['inventory_category_items_summary_view', 'inventory_item_details_view', 'inventory_item_movements_view']) {
        const response = await withTimeout(client.from(view).select('*').limit(1), `Refresh ${view}`)
        if (response.error) errors.push(`${view}: ${response.error.message || 'Refresh failed.'}`)
      }
      return errors
    },
    async saveSummary(preview, result) {
      const { error } = await client.from('imports').insert({
        file_name: preview.fileName,
        status: result.completed && result.errors.length === 0 ? 'completed' : 'completed_with_warnings',
        total_sheets: preview.sheetDiagnoses?.length ?? 0,
        total_rows: result.importedRowCount,
        success_rows: result.insertedItemsCount + result.updatedItemsCount + result.insertedMovementsCount + (result.insertedCustodyCount ?? 0),
        failed_rows: (result.skippedItemsCount ?? 0) + (result.skippedMovementsCount ?? 0) + (result.skippedCustodyCount ?? 0),
        ignored_sheets: preview.ignoredSheets,
        warnings: preview.warnings,
        errors: result.errors,
        matched_sheets: preview.sheetDiagnoses?.map((sheet) => sheet.sheetName) ?? [],
        finished_at: new Date().toISOString(),
        inserted_items_count: result.insertedItemsCount,
        updated_items_count: result.updatedItemsCount,
        skipped_items_count: result.skippedItemsCount ?? 0,
        inserted_movements_count: result.insertedMovementsCount,
        skipped_movements_count: result.skippedMovementsCount ?? 0,
      } as never)
      return error?.message ?? null
    },
  }
}

export async function importCustomInventoryExcel(
  preview: CustomExcelPreview,
  onProgress?: (progress: CustomImportProgress) => void,
): ServiceResult<InventoryImportResult> {
  if (!isSupabaseConfigured || !supabaseClient) return { data: null, error: getSupabaseConfigError() }
  if (preview.errors.length > 0) return { data: null, error: preview.errors.join(' | ') }
  return { data: await executeCustomInventoryImport(preview, createSupabaseGateway(), onProgress), error: null }
}
