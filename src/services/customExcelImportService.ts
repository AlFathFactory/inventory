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

export function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < arr.length; index += size) {
    chunks.push(arr.slice(index, index + size))
  }
  return chunks
}

function withoutParserFields(row: CustomExcelRow) {
  const { __rowNumber: _rowNumber, ...record } = row
  return record
}

function getRpcErrors(data: unknown): string[] {
  if (!data || typeof data !== 'object' || !('errors' in data)) return []
  const errors = (data as { errors?: unknown }).errors
  if (!Array.isArray(errors)) return []
  return errors.map((error) =>
    typeof error === 'string' ? error : JSON.stringify(error),
  )
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
  logLabel: string,
  chunkNumber: number,
  chunkLength: number,
) {
  console.log(`Importing ${logLabel} chunk`, chunkNumber, chunkLength)
  const result = await withTimeout(
    supabaseClient!.rpc(functionName, args as never),
    `${logLabel} chunk ${chunkNumber}`,
  )
  console.log(`${logLabel} chunk result`, {
    chunk: chunkNumber,
    data: result.data,
    error: result.error,
  })
  if (result.error) {
    throw new Error(`${logLabel} chunk ${chunkNumber}: ${result.error.message || 'Supabase RPC failed.'}`)
  }
  return getRpcErrors(result.data)
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

  const warnings: string[] = []
  let importedItems = 0
  let importedMovements = 0

  try {
    const itemChunks = chunkArray(preview.items, ITEM_CHUNK_SIZE)
    const movementChunks = chunkArray(preview.movements, MOVEMENT_CHUNK_SIZE)
    const cuttingChunks = chunkArray(preview.cuttingDiscs, CUSTODY_CHUNK_SIZE)
    const glovesChunks = chunkArray(preview.longWeldingGloves, CUSTODY_CHUNK_SIZE)

    for (let index = 0; index < itemChunks.length; index += 1) {
      const chunk = itemChunks[index]
      onProgress?.({ stage: 'items', label: 'استيراد الأصناف', current: importedItems, total: preview.items.length, chunk: index + 1, totalChunks: itemChunks.length })
      const rpcWarnings = await runRpcChunk('import_normalized_items_chunk_rpc', {
        p_items: chunk.map(withoutParserFields),
      }, 'items', index + 1, chunk.length)
      warnings.push(...rpcWarnings.map((warning) => `Items chunk ${index + 1}: ${warning}`))
      importedItems += chunk.length
      onProgress?.({ stage: 'items', label: 'استيراد الأصناف', current: importedItems, total: preview.items.length, chunk: index + 1, totalChunks: itemChunks.length })
    }

    for (let index = 0; index < movementChunks.length; index += 1) {
      const chunk = movementChunks[index]
      onProgress?.({ stage: 'movements', label: 'استيراد الحركات', current: importedMovements, total: preview.movements.length, chunk: index + 1, totalChunks: movementChunks.length })
      const rpcWarnings = await runRpcChunk('import_normalized_movements_chunk_rpc', {
        p_movements: chunk.map(withoutParserFields),
      }, 'movements', index + 1, chunk.length)
      warnings.push(...rpcWarnings.map((warning) => `Movements chunk ${index + 1}: ${warning}`))
      importedMovements += chunk.length
      onProgress?.({ stage: 'movements', label: 'استيراد الحركات', current: importedMovements, total: preview.movements.length, chunk: index + 1, totalChunks: movementChunks.length })
    }

    for (let index = 0; index < cuttingChunks.length; index += 1) {
      const chunk = cuttingChunks[index]
      onProgress?.({ stage: 'cutting_discs', label: 'استيراد صواريخ القطع', current: index * CUSTODY_CHUNK_SIZE, total: preview.cuttingDiscs.length, chunk: index + 1, totalChunks: cuttingChunks.length })
      const rpcWarnings = await runRpcChunk('import_normalized_custody_chunk_rpc', {
        p_table_name: 'cutting_discs', p_records: chunk.map(withoutParserFields),
      }, 'cutting discs', index + 1, chunk.length)
      warnings.push(...rpcWarnings.map((warning) => `Cutting_Discs chunk ${index + 1}: ${warning}`))
      onProgress?.({ stage: 'cutting_discs', label: 'استيراد صواريخ القطع', current: Math.min((index + 1) * CUSTODY_CHUNK_SIZE, preview.cuttingDiscs.length), total: preview.cuttingDiscs.length, chunk: index + 1, totalChunks: cuttingChunks.length })
    }

    for (let index = 0; index < glovesChunks.length; index += 1) {
      const chunk = glovesChunks[index]
      onProgress?.({ stage: 'long_welding_gloves', label: 'استيراد جوانتي اللحام', current: index * CUSTODY_CHUNK_SIZE, total: preview.longWeldingGloves.length, chunk: index + 1, totalChunks: glovesChunks.length })
      const rpcWarnings = await runRpcChunk('import_normalized_custody_chunk_rpc', {
        p_table_name: 'long_welding_gloves', p_records: chunk.map(withoutParserFields),
      }, 'long welding gloves', index + 1, chunk.length)
      warnings.push(...rpcWarnings.map((warning) => `Long_Welding_Gloves chunk ${index + 1}: ${warning}`))
      onProgress?.({ stage: 'long_welding_gloves', label: 'استيراد جوانتي اللحام', current: Math.min((index + 1) * CUSTODY_CHUNK_SIZE, preview.longWeldingGloves.length), total: preview.longWeldingGloves.length, chunk: index + 1, totalChunks: glovesChunks.length })
    }

    onProgress?.({ stage: 'refreshing', label: 'تحديث بيانات المخزون', current: 1, total: 1, chunk: 1, totalChunks: 1 })
    for (const view of ['inventory_category_items_summary_view', 'inventory_item_movements_view']) {
      const result = await withTimeout(supabaseClient.from(view).select('*').limit(1), `Refresh ${view}`)
      if (result.error) warnings.push(`${view}: ${result.error.message || 'Refresh failed.'}`)
    }

    return {
      data: {
        importedRowCount: preview.items.length + preview.movements.length + preview.cuttingDiscs.length + preview.longWeldingGloves.length,
        processedItemCount: importedItems,
        insertedItemsCount: importedItems,
        updatedItemsCount: 0,
        insertedMovementsCount: importedMovements,
        errors: warnings,
      },
      error: null,
    }
  } catch (error) {
    console.error('Custom Excel import failed', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'حدث خطأ أثناء استيراد ملف Excel المخصص.',
    }
  }
}
