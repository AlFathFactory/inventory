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
  StockTableName,
} from '../utils/customExcelParser'
import type { InventoryImportResult, ServiceResult } from './inventoryService'

export const CUSTOM_IMPORT_CHUNK_SIZES = {
  items: 100,
  movements: 150,
  custody: 100,
} as const

const RPC_TIMEOUT_MS = 60_000

export type CustomImportStage =
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

type ChunkCounts = {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
  itemsNeedingCodes: ItemNeedingCode[]
}

export type CustomImportGateway = {
  runRpc: (functionName: string, args: Record<string, unknown>) => Promise<unknown>
  generateInternalCode: (item: ItemNeedingCode) => Promise<void>
  refreshInventory: () => Promise<string[]>
  saveSummary: (preview: CustomExcelPreview, result: InventoryImportResult) => Promise<string | null>
}

export function chunkArray<T>(values: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) throw new Error('Chunk size must be a positive integer.')
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
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

export function parseChunkCounts(data: unknown): ChunkCounts {
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== 'object') {
    return { inserted: 0, updated: 0, skipped: 0, errors: [], itemsNeedingCodes: [] }
  }

  const record = value as Record<string, unknown>
  const rawErrors = Array.isArray(record.errors) ? record.errors : []
  const rawCodeItems = Array.isArray(record.items_needing_codes) ? record.items_needing_codes : []
  const itemsNeedingCodes = rawCodeItems.flatMap<ItemNeedingCode>((item) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Record<string, unknown>
    const tableName = String(candidate.table_name ?? '') as StockTableName
    const itemId = String(candidate.item_id ?? '')
    if (!itemId || !['consumables', 'paints', 'screws', 'stock_screws', 'raw_materials', 'cylinders'].includes(tableName)) return []
    return [{ table_name: tableName, item_id: itemId }]
  })

  return {
    inserted: toCount(record.inserted ?? record.inserted_items),
    updated: toCount(record.updated ?? record.updated_items),
    skipped: toCount(record.skipped ?? record.skipped_items),
    errors: rawErrors.map(stringifyError),
    itemsNeedingCodes,
  }
}

export function prepareItem(item: CustomInventoryItem): Record<string, unknown> {
  return {
    ...item,
    fields: {
      ...item.fields,
      din: item.fields.din?.trim() || null,
      code_number: item.fields.code_number?.trim() || null,
    },
  }
}

export function prepareMovement(movement: CustomInventoryMovement): Record<string, unknown> {
  return { ...movement }
}

function prepareCuttingDisc(record: CustomCuttingDisc): Record<string, unknown> {
  return { ...record }
}

function prepareWeldingGlove(record: CustomWeldingGlove): Record<string, unknown> {
  return { ...record }
}

function stageLabel(stage: CustomImportStage) {
  const labels: Record<CustomImportStage, string> = {
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
    emitProgress(
      options.onProgress,
      options.stage,
      index * options.size,
      options.values.length,
      chunkNumber,
      chunks.length,
    )
    const counts = parseChunkCounts(
      await options.gateway.runRpc(options.rpcName, options.buildArgs(chunks[index])),
    )
    options.onCounts(counts)
    if (counts.errors.length > 0) {
      throw new Error(`${stageLabel(options.stage)} - الحزمة ${chunkNumber}: ${counts.errors.join(' | ')}`)
    }
    options.onCompleted()
    emitProgress(
      options.onProgress,
      options.stage,
      Math.min(chunkNumber * options.size, options.values.length),
      options.values.length,
      chunkNumber,
      chunks.length,
    )
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
  let failedStage: CustomImportStage | null = null
  let failedChunk: number | null = null
  const errors: string[] = []
  const codeItems = new Map<string, ItemNeedingCode>()

  const snapshot = (): InventoryImportResult => ({
    importedRowCount:
      preview.items.length +
      preview.movements.length +
      preview.cuttingDiscs.length +
      preview.longWeldingGloves.length,
    processedItemCount: insertedItemsCount + updatedItemsCount + skippedItemsCount,
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
  })

  const beforeChunk = (stage: CustomImportStage, chunk: number) => {
    failedStage = stage
    failedChunk = chunk
  }

  try {
    await importChunks({
      values: preview.items,
      size: CUSTOM_IMPORT_CHUNK_SIZES.items,
      stage: 'items',
      rpcName: 'import_normalized_items_chunk_rpc',
      buildArgs: (chunk) => ({ p_items: chunk.map(prepareItem) }),
      gateway,
      onProgress,
      beforeChunk,
      onCompleted: () => { completedChunks += 1 },
      onCounts: (counts) => {
        insertedItemsCount += counts.inserted
        updatedItemsCount += counts.updated
        skippedItemsCount += counts.skipped
        counts.itemsNeedingCodes.forEach((item) => codeItems.set(`${item.table_name}:${item.item_id}`, item))
      },
    })

    await importChunks({
      values: preview.movements,
      size: CUSTOM_IMPORT_CHUNK_SIZES.movements,
      stage: 'movements',
      rpcName: 'import_normalized_movements_chunk_rpc',
      buildArgs: (chunk) => ({ p_movements: chunk.map(prepareMovement) }),
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
    const completedResult = snapshot()
    const summaryError = await gateway.saveSummary(preview, completedResult)
    if (summaryError) errors.push(`تعذر حفظ ملخص الاستيراد: ${summaryError}`)
    emitProgress(onProgress, 'complete', 1, 1, 1, 1)
    return snapshot()
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'حدث خطأ أثناء استيراد ملف Excel المخصص.')
    return snapshot()
  }
}

type SupabaseRpcResult = {
  data: unknown
  error: { message?: string } | null
}

async function withTimeout(
  request: PromiseLike<SupabaseRpcResult>,
  operationLabel: string,
): Promise<SupabaseRpcResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${operationLabel}: انتهت مهلة الاتصال بعد 60 ثانية.`)),
          RPC_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function createSupabaseGateway(): CustomImportGateway {
  return {
    async runRpc(functionName, args) {
      const response = await withTimeout(
        supabaseClient!.rpc(functionName, args as never),
        functionName,
      )
      if (response.error) throw new Error(response.error.message || `${functionName} failed.`)
      return response.data
    },
    async generateInternalCode(item) {
      const response = await withTimeout(
        supabaseClient!.rpc('generate_inventory_internal_code_rpc', {
          p_table_name: item.table_name,
          p_item_id: item.item_id,
        } as never),
        'generate_inventory_internal_code_rpc',
      )
      if (response.error) throw new Error(response.error.message || 'تعذر إنشاء الكود الداخلي.')
    },
    async refreshInventory() {
      const errors: string[] = []
      for (const view of [
        'inventory_category_items_summary_view',
        'inventory_item_details_view',
        'inventory_item_movements_view',
      ]) {
        const response = await withTimeout(
          supabaseClient!.from(view).select('*').limit(1),
          `Refresh ${view}`,
        )
        if (response.error) errors.push(`${view}: ${response.error.message || 'Refresh failed.'}`)
      }
      return errors
    },
    async saveSummary(preview, result) {
      const { error } = await supabaseClient!.from('imports').insert({
        file_name: preview.fileName,
        status: result.completed && result.errors.length === 0 ? 'completed' : 'completed_with_warnings',
        total_sheets: preview.sheetDiagnoses?.length ?? 0,
        total_rows: result.importedRowCount,
        success_rows:
          result.insertedItemsCount +
          result.updatedItemsCount +
          result.insertedMovementsCount +
          (result.insertedCustodyCount ?? 0),
        failed_rows:
          (result.skippedItemsCount ?? 0) +
          (result.skippedMovementsCount ?? 0) +
          (result.skippedCustodyCount ?? 0),
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
  if (!isSupabaseConfigured || !supabaseClient) {
    return { data: null, error: getSupabaseConfigError() }
  }
  if (preview.errors.length > 0) {
    return { data: null, error: preview.errors.join(' | ') }
  }
  return {
    data: await executeCustomInventoryImport(preview, createSupabaseGateway(), onProgress),
    error: null,
  }
}
