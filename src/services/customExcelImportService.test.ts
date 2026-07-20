import { describe, expect, it, vi } from 'vitest'
import {
  CUSTOM_IMPORT_CHUNK_SIZES,
  executeCustomInventoryImport,
  prepareItem,
  type CustomImportGateway,
  type CustomImportProgress,
} from './customExcelImportService'
import type {
  CustomExcelPreview,
  CustomInventoryItem,
  CustomInventoryMovement,
} from '../utils/customExcelParser'

function item(index: number): CustomInventoryItem {
  return {
    table_name: 'screws',
    item_key: `screws::rott::bolt-${index}::933::00${index}`,
    project_name: 'ROTT',
    item_name: `Bolt ${index}`,
    opening_balance: 1,
    total_added: 0,
    total_issued: 0,
    stock_balance: 1,
    transaction_date: '2026-07-31',
    source: { file_name: 'inventory.xlsx', sheet: 'مسامير', row: index + 2 },
    fields: { din: ' 933 ', code_number: ` 00${index} ` },
  }
}

function movement(index: number): CustomInventoryMovement {
  return {
    table_name: 'screws',
    item_key: `screws::rott::bolt-${index}::933::00${index}`,
    project_name: 'ROTT',
    category_name: 'مسامير',
    item_name: `Bolt ${index}`,
    operation_type: 'issue',
    operation_date: '2026-07-01',
    quantity: 1,
    previous_balance: 1,
    new_balance: 0,
    import_key: `movement-${index}`,
    source: { file_name: 'inventory.xlsx', sheet: 'مسامير', row: index + 2 },
  }
}

function preview(overrides: Partial<CustomExcelPreview> = {}): CustomExcelPreview {
  return {
    kind: 'custom-excel',
    fileName: 'inventory.xlsx',
    items: [item(1)],
    movements: [movement(1)],
    cuttingDiscs: [],
    longWeldingGloves: [],
    errors: [],
    warnings: [],
    ignoredSheets: [],
    ...overrides,
  }
}

function gateway(runRpc?: CustomImportGateway['runRpc']): CustomImportGateway {
  return {
    runRpc: runRpc ?? vi.fn(async () => ({ inserted: 1, updated: 0, skipped: 0, errors: [] })),
    generateInternalCode: vi.fn(async () => undefined),
    refreshInventory: vi.fn(async () => []),
    saveSummary: vi.fn(async () => null),
  }
}

describe('prepareItem', () => {
  it('keeps DIN and code_number as trimmed text inside fields', () => {
    expect(prepareItem(item(7))).toMatchObject({
      fields: { din: '933', code_number: '007' },
    })
  })
})

describe('executeCustomInventoryImport', () => {
  it('imports item chunks before movement and custody chunks', async () => {
    const calls: string[] = []
    const mockGateway = gateway(async (functionName, args) => {
      calls.push(`${functionName}:${String(args.p_table_name ?? '')}`)
      if (functionName === 'import_normalized_items_chunk_rpc') {
        return {
          inserted: 1,
          updated: 0,
          skipped: 0,
          errors: [],
          items_needing_codes: [{ table_name: 'screws', item_id: 'item-id' }],
        }
      }
      return { inserted: 1, updated: 0, skipped: 0, errors: [] }
    })
    const input = preview({
      cuttingDiscs: [{
        code: 'B01', type_name: 'BOSCH', received_by: null, received_date: null,
        scrapped_date: null, source_file: 'inventory.xlsx', source_sheet: 'صواريخ', source_row: 2,
      }],
      longWeldingGloves: [{
        type_name: 'جوانتي اسود', received_by: 'عامل', received_date: '2026-07-01', quantity: 1,
        source_file: 'inventory.xlsx', source_sheet: 'جوانتي لحام طويل', source_row: 2,
      }],
    })

    const result = await executeCustomInventoryImport(input, mockGateway)

    expect(calls).toEqual([
      'import_normalized_items_chunk_rpc:',
      'import_normalized_movements_chunk_rpc:',
      'import_normalized_custody_chunk_rpc:cutting_discs',
      'import_normalized_custody_chunk_rpc:long_welding_gloves',
    ])
    expect(mockGateway.generateInternalCode).toHaveBeenCalledWith({ table_name: 'screws', item_id: 'item-id' })
    expect(result.completed).toBe(true)
  })

  it('stops before movements when an item chunk fails', async () => {
    const runRpc = vi.fn(async () => ({ inserted: 0, updated: 0, skipped: 1, errors: ['unsafe item'] }))
    const result = await executeCustomInventoryImport(preview(), gateway(runRpc))

    expect(runRpc).toHaveBeenCalledTimes(1)
    expect(result.completed).toBe(false)
    expect(result.failedStage).toBe('items')
    expect(result.failedChunk).toBe(1)
    expect(result.completedChunks).toBe(0)
  })

  it('reports accurate chunk progress', async () => {
    const items = Array.from({ length: CUSTOM_IMPORT_CHUNK_SIZES.items + 1 }, (_, index) => item(index))
    const progress: CustomImportProgress[] = []
    await executeCustomInventoryImport(preview({ items, movements: [] }), gateway(), (value) => progress.push(value))

    const itemProgress = progress.filter((value) => value.stage === 'items')
    expect(itemProgress.at(-1)).toMatchObject({
      current: items.length,
      total: items.length,
      chunk: 2,
      totalChunks: 2,
    })
    expect(progress.at(-1)?.stage).toBe('complete')
  })

  it('does not regenerate internal codes for existing coded items', async () => {
    const mockGateway = gateway(async () => ({ inserted: 0, updated: 1, skipped: 0, errors: [] }))
    await executeCustomInventoryImport(preview({ movements: [] }), mockGateway)
    expect(mockGateway.generateInternalCode).not.toHaveBeenCalled()
  })
})
