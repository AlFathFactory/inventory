import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'
import type { CustomExcelPreview, CustomExcelRow } from '../utils/customExcelParser'
import type { InventoryImportResult, ServiceResult } from './inventoryService'

const ITEM_CHUNK_SIZE = 200
const MOVEMENT_CHUNK_SIZE = 300
const CUSTODY_CHUNK_SIZE = 200
const RPC_TIMEOUT_MS = 60_000

export type CustomImportStage =
  | 'items'
  | 'movements'
  | 'cutting_discs'
  | 'long_welding_gloves'
  | 'refreshing'

export type CustomImportProgress = {
  stage: CustomImportStage
  label: string
  current: number
  total: number
  chunk: number
  totalChunks: number
}

type RpcResult = {
  data: unknown
  error: { message?: string } | null
}

type ChunkCounts = {
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

export function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < arr.length; index += size) {
    chunks.push(arr.slice(index, index + size))
  }
  return chunks
}

function toCount(value: unknown) {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : 0
}

function parseChunkCounts(data: unknown): ChunkCounts {
  const value = Array.isArray(data) ? data[0] : data
  if (!value || typeof value !== 'object') {
    return { inserted: 0, updated: 0, skipped: 0, errors: [] }
  }

  const record = value as Record<string, unknown>
  const rawErrors = Array.isArray(record.errors) ? record.errors : []
  return {
    inserted: toCount(record.inserted),
    updated: toCount(record.updated),
    skipped: toCount(record.skipped),
    errors: rawErrors.map((error) =>
      typeof error === 'string' ? error : JSON.stringify(error),
    ),
  }
}

function withoutParserFields(row: CustomExcelRow) {
  const { __rowNumber: _rowNumber, ...record } = row
  return record
}

function getText(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function getFirstText(
  record: Record<string, CustomExcelRow[string]>,
  columnNames: readonly string[],
) {
  for (const columnName of columnNames) {
    const value = getText(record[columnName])
    if (value) return value
  }
  return ''
}

export function prepareItem(row: CustomExcelRow): Record<string, CustomExcelRow[string]> {
  const record = withoutParserFields(row)
  const { din: canonicalDin, code_number: canonicalCodeNumber, ...recordWithoutCanonicalFields } = record
  const tableName = getText(record.table_name)

  if (tableName === 'screws' || tableName === 'stock_screws') {
    return {
      ...recordWithoutCanonicalFields,
      din: getFirstText(
        { ...record, din: canonicalDin },
        ['din', 'DIN', 'Din', 'كود DIN'],
      ) || null,
      code_number: getFirstText(
        { ...record, code_number: canonicalCodeNumber },
        ['code_number', 'Code Number', 'رقم الكود', 'رقم الصنف'],
      ) || null,
    }
  }

  if (tableName === 'raw_materials') {
    return {
      ...recordWithoutCanonicalFields,
      code_number: getText(canonicalCodeNumber) || null,
    }
  }

  return recordWithoutCanonicalFields
}

export function buildMovementImportKey(
  fileName: string,
  row: CustomExcelRow,
) {
  return [
    fileName,
    'Movements',
    row.__rowNumber,
    getText(row.item_key),
    getText(row.operation_type).toLowerCase(),
    getText(row.operation_date),
    getText(row.quantity),
  ].join('|')
}

function prepareMovement(fileName: string, row: CustomExcelRow) {
  return {
    ...withoutParserFields(row),
    import_key: buildMovementImportKey(fileName, row),
  }
}

async function withTimeout(
  request: PromiseLike<RpcResult>,
  operationLabel: string,
): Promise<RpcResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${operationLabel}: انتهت مهلة الاتصال بـ Supabase بعد 60 ثانية.`))
        }, RPC_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function runRpcChunk(
  functionName: string,
  args: Record<string, unknown>,
  stage: CustomImportStage,
  chunkNumber: number,
) {
  const result = await withTimeout(
    supabaseClient!.rpc(functionName, args as never),
    `${stage} chunk ${chunkNumber}`,
  )
  if (result.error) {
    throw new Error(
      `${stage} chunk ${chunkNumber}: ${result.error.message || 'Supabase RPC failed.'}`,
    )
  }
  return parseChunkCounts(result.data)
}

export async function importCustomInventoryExcel(
  preview: CustomExcelPreview,
  onProgress?: (progress: CustomImportProgress) => void,
): ServiceResult<InventoryImportResult> {
  if (!isSupabaseConfigured || !supabaseClient) {
    return { data: null, error: getSupabaseConfigError() }
  }
  if (preview.errors.length) {
    return { data: null, error: preview.errors.join(' | ') }
  }

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

  const itemChunks = chunkArray(preview.items, ITEM_CHUNK_SIZE)
  const movementChunks = chunkArray(preview.movements, MOVEMENT_CHUNK_SIZE)
  const cuttingChunks = chunkArray(preview.cuttingDiscs, CUSTODY_CHUNK_SIZE)
  const glovesChunks = chunkArray(preview.longWeldingGloves, CUSTODY_CHUNK_SIZE)

  const result = (): InventoryImportResult => ({
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

  try {
    for (let index = 0; index < itemChunks.length; index += 1) {
      failedStage = 'items'
      failedChunk = index + 1
      const chunk = itemChunks[index]
      onProgress?.({ stage: 'items', label: 'استيراد الأصناف', current: index * ITEM_CHUNK_SIZE, total: preview.items.length, chunk: index + 1, totalChunks: itemChunks.length })
      const counts = await runRpcChunk('import_normalized_items_chunk_rpc', { p_items: chunk.map(prepareItem) }, 'items', index + 1)
      insertedItemsCount += counts.inserted
      updatedItemsCount += counts.updated
      skippedItemsCount += counts.skipped
      errors.push(...counts.errors.map((error) => `Items chunk ${index + 1}: ${error}`))
      completedChunks += 1
    }

    for (let index = 0; index < movementChunks.length; index += 1) {
      failedStage = 'movements'
      failedChunk = index + 1
      const chunk = movementChunks[index]
      onProgress?.({ stage: 'movements', label: 'استيراد الحركات', current: index * MOVEMENT_CHUNK_SIZE, total: preview.movements.length, chunk: index + 1, totalChunks: movementChunks.length })
      const counts = await runRpcChunk('import_normalized_movements_chunk_rpc', { p_movements: chunk.map((row) => prepareMovement(preview.fileName, row)) }, 'movements', index + 1)
      insertedMovementsCount += counts.inserted
      updatedMovementsCount += counts.updated
      skippedMovementsCount += counts.skipped
      errors.push(...counts.errors.map((error) => `Movements chunk ${index + 1}: ${error}`))
      completedChunks += 1
    }

    for (const [stage, chunks, tableName, total] of [
      ['cutting_discs', cuttingChunks, 'cutting_discs', preview.cuttingDiscs.length],
      ['long_welding_gloves', glovesChunks, 'long_welding_gloves', preview.longWeldingGloves.length],
    ] as const) {
      for (let index = 0; index < chunks.length; index += 1) {
        failedStage = stage
        failedChunk = index + 1
        const chunk = chunks[index]
        onProgress?.({ stage, label: stage === 'cutting_discs' ? 'استيراد صواريخ القطع' : 'استيراد جوانتي اللحام', current: index * CUSTODY_CHUNK_SIZE, total, chunk: index + 1, totalChunks: chunks.length })
        const counts = await runRpcChunk('import_normalized_custody_chunk_rpc', { p_table_name: tableName, p_records: chunk.map(withoutParserFields) }, stage, index + 1)
        insertedCustodyCount += counts.inserted
        updatedCustodyCount += counts.updated
        skippedCustodyCount += counts.skipped
        errors.push(...counts.errors.map((error) => `${stage} chunk ${index + 1}: ${error}`))
        completedChunks += 1
      }
    }

    failedStage = 'refreshing'
    failedChunk = 1
    onProgress?.({ stage: 'refreshing', label: 'تحديث بيانات المخزون', current: 1, total: 1, chunk: 1, totalChunks: 1 })
    for (const view of ['inventory_category_items_summary_view', 'inventory_item_details_view', 'inventory_item_movements_view']) {
      const refreshResult = await withTimeout(supabaseClient.from(view).select('*').limit(1), `Refresh ${view}`)
      if (refreshResult.error) errors.push(`${view}: ${refreshResult.error.message || 'Refresh failed.'}`)
    }

    failedStage = null
    failedChunk = null
    return { data: result(), error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'حدث خطأ أثناء استيراد ملف Excel المخصص.'
    errors.push(message)
    return { data: result(), error: null }
  }
}
