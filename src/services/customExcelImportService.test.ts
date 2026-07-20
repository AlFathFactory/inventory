import { describe, expect, it, vi } from 'vitest'
import {
  CUSTOM_IMPORT_CHUNK_SIZES,
  executeCustomInventoryImport,
  matchInventoryItems,
  prepareCustomInventoryPreview,
  prepareItem,
  type CustomImportGateway,
  type CustomImportProgress,
} from './customExcelImportService'
import type {
  CustomExcelPreview,
  CustomInventoryItem,
  CustomInventoryMovement,
} from '../utils/customExcelParser'

function item(index: number, overrides: Partial<CustomInventoryItem> = {}): CustomInventoryItem {
  const itemKey = `screws::rott::bolt-${index}::933::00${index}`
  return {
    client_key: `inventory.xlsx|مسامير|${index + 2}|${itemKey}`,
    table_name: 'screws',
    item_key: itemKey,
    project_name: 'ROTT',
    item_name: `Bolt ${index}`,
    opening_balance: 1,
    total_added: 0,
    total_issued: 0,
    stock_balance: 1,
    transaction_date: '2026-07-31',
    source: { file_name: 'inventory.xlsx', sheet: 'مسامير', row: index + 2 },
    fields: { din: ' 933 ', code_number: ` 00${index} ` },
    ...overrides,
  }
}

function movement(index: number): CustomInventoryMovement {
  return {
    table_name: 'screws',
    item_key: item(index).item_key,
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
    duplicateItemsCount: 0,
    duplicateMovementsCount: 0,
    ...overrides,
  }
}

function matchResult(
  source: Record<string, unknown>,
  status: 'matched' | 'ambiguous' | 'not_found' = 'not_found',
  options: { itemId?: string; method?: string; candidates?: string[] } = {},
) {
  return {
    client_key: source.client_key,
    table_name: source.table_name,
    item_key: source.item_key,
    match: {
      status,
      item_id: options.itemId ?? null,
      match_method: options.method ?? null,
      match_count: status === 'ambiguous' ? (options.candidates?.length ?? 2) : status === 'matched' ? 1 : 0,
      candidate_ids: options.candidates,
    },
  }
}

function gateway(runRpc?: CustomImportGateway['runRpc']): CustomImportGateway {
  const defaultRunRpc: CustomImportGateway['runRpc'] = vi.fn(async (functionName, args) => {
    if (functionName === 'match_inventory_items_chunk_rpc') {
      const items = args.p_items as Record<string, unknown>[]
      return { results: items.map((source) => matchResult(source)) }
    }
    if (functionName === 'match_inventory_movement_keys_chunk_rpc') return { existing_keys: [] }
    if (functionName === 'import_normalized_items_chunk_rpc') {
      const items = args.p_items as Record<string, unknown>[]
      return {
        inserted: items.length,
        updated: 0,
        skipped: 0,
        errors: [],
        item_results: items.map((source, index) => ({
          client_key: source.client_key,
          table_name: source.table_name,
          item_key: source.item_key,
          item_id: `new-${index}`,
          action: 'inserted',
        })),
      }
    }
    const values = (args.p_movements ?? args.p_records ?? []) as unknown[]
    return { inserted: values.length, updated: 0, skipped: 0, errors: [] }
  })
  return {
    runRpc: runRpc ?? defaultRunRpc,
    generateInternalCode: vi.fn(async () => undefined),
    refreshInventory: vi.fn(async () => []),
    saveSummary: vi.fn(async () => null),
  }
}

describe('item matching payloads', () => {
  it('keeps identifiers as text and sends all available fallback fields', () => {
    expect(prepareItem(item(7))).toMatchObject({
      client_key: expect.any(String),
      din: '933',
      code_number: '007',
      fields: { din: '933', code_number: '007' },
    })
  })

  it('does not require an internal code', () => {
    expect(prepareItem(item(1)).internal_code).toBeNull()
  })

  it('associates out-of-order RPC rows by client_key, not array position', async () => {
    const items = [item(1), item(2)]
    const mockGateway = gateway(async (_name, args) => {
      const payload = args.p_items as Record<string, unknown>[]
      return { results: [
        matchResult(payload[1], 'matched', { itemId: 'db-2', method: 'internal_code' }),
        matchResult(payload[0], 'not_found'),
      ] }
    })
    const summary = await matchInventoryItems(items, undefined, mockGateway)
    expect(summary.matched[0]).toMatchObject({ sourceItem: items[1], itemId: 'db-2' })
    expect(summary.newItems).toEqual([items[0]])
  })

  it('classifies exact key, internal code, business identity, and not-found responses', async () => {
    const items = [item(1), item(2), item(3), item(4)]
    const mockGateway = gateway(async (_name, args) => {
      const payload = args.p_items as Record<string, unknown>[]
      return { results: [
        matchResult(payload[0], 'matched', { itemId: 'a', method: 'item_key' }),
        matchResult(payload[1], 'matched', { itemId: 'b', method: 'internal_code' }),
        matchResult(payload[2], 'matched', { itemId: 'c', method: 'screw_business_identity' }),
        matchResult(payload[3], 'not_found'),
      ] }
    })
    const summary = await matchInventoryItems(items, undefined, mockGateway)
    expect(summary.matched.map((entry) => entry.matchMethod)).toEqual(['item_key', 'internal_code', 'screw_business_identity'])
    expect(summary.newItems).toEqual([items[3]])
  })

  it('keeps raw materials with different dimensions as distinct client records', async () => {
    const first = item(1, { table_name: 'raw_materials', item_key: 'raw::plate::10', fields: { th: 10 } })
    const second = item(2, { table_name: 'raw_materials', item_key: 'raw::plate::12', fields: { th: 12 } })
    const summary = await matchInventoryItems([first, second], undefined, gateway())
    expect(summary.newItems).toEqual([first, second])
  })

  it('fails when a response client_key is unknown', async () => {
    const mockGateway = gateway(async (_name, args) => {
      const source = (args.p_items as Record<string, unknown>[])[0]
      return { results: [{ ...matchResult(source), client_key: 'unknown' }] }
    })
    await expect(matchInventoryItems([item(1)], undefined, mockGateway)).rejects.toThrow('client_key غير معروف')
  })

  it('reports matching progress in chunks of 100', async () => {
    const items = Array.from({ length: 101 }, (_, index) => item(index))
    const progress: CustomImportProgress[] = []
    await matchInventoryItems(items, (value) => progress.push(value), gateway())
    expect(progress.filter((value) => value.stage === 'matching').at(-1)).toMatchObject({
      current: 101, total: 101, chunk: 2, totalChunks: 2,
    })
  })
})

describe('preview matching', () => {
  it('shows existing/new movement counts before confirmation', async () => {
    const mockGateway = gateway(async (name, args) => {
      if (name === 'match_inventory_items_chunk_rpc') {
        const source = (args.p_items as Record<string, unknown>[])[0]
        return { results: [matchResult(source, 'matched', { itemId: 'existing', method: 'item_key' })] }
      }
      return { existing_keys: ['movement-1'] }
    })
    const result = await prepareCustomInventoryPreview(preview(), undefined, mockGateway)
    expect(result.matching).toMatchObject({
      newMovementsCount: 0,
      duplicateMovementsCount: 1,
    })
  })

  it('adds detailed errors for ambiguous records', async () => {
    const mockGateway = gateway(async (_name, args) => {
      const source = (args.p_items as Record<string, unknown>[])[0]
      return { results: [matchResult(source, 'ambiguous', { method: 'screw_business_identity', candidates: ['id-a', 'id-b'] })] }
    })
    const result = await prepareCustomInventoryPreview(preview({ movements: [] }), undefined, mockGateway)
    expect(result.errors[0]).toContain('الشيت: مسامير')
    expect(result.errors[0]).toContain('id-a, id-b')
  })
})

describe('executeCustomInventoryImport', () => {
  it('matches before every item, movement, and custody write', async () => {
    const calls: string[] = []
    const mockGateway = gateway(async (name, args) => {
      calls.push(name)
      if (name === 'match_inventory_items_chunk_rpc') {
        const source = (args.p_items as Record<string, unknown>[])[0]
        return { results: [matchResult(source)] }
      }
      if (name === 'import_normalized_items_chunk_rpc') {
        const source = (args.p_items as Record<string, unknown>[])[0]
        return {
          inserted: 1, updated: 0, skipped: 0, errors: [],
          item_results: [{ client_key: source.client_key, table_name: source.table_name, item_key: source.item_key, item_id: 'new-id', action: 'inserted' }],
          items_needing_codes: [{ table_name: 'screws', item_id: 'new-id' }],
        }
      }
      const values = (args.p_movements ?? args.p_records ?? []) as unknown[]
      return { inserted: values.length, updated: 0, skipped: 0, errors: [] }
    })
    const input = preview({
      cuttingDiscs: [{ code: 'B01', type_name: 'BOSCH', received_by: null, received_date: null, scrapped_date: null, source_file: 'inventory.xlsx', source_sheet: 'صواريخ', source_row: 2 }],
      longWeldingGloves: [{ type_name: 'جوانتي اسود', received_by: 'عامل', received_date: '2026-07-01', quantity: 1, source_file: 'inventory.xlsx', source_sheet: 'جوانتي لحام طويل', source_row: 2 }],
    })
    const result = await executeCustomInventoryImport(input, mockGateway)
    expect(calls).toEqual([
      'match_inventory_items_chunk_rpc',
      'import_normalized_items_chunk_rpc',
      'import_normalized_movements_chunk_rpc',
      'import_normalized_custody_chunk_rpc',
      'import_normalized_custody_chunk_rpc',
    ])
    expect(mockGateway.generateInternalCode).toHaveBeenCalledWith({ table_name: 'screws', item_id: 'new-id' })
    expect(result.completed).toBe(true)
  })

  it('blocks every write when an item is ambiguous', async () => {
    const runRpc = vi.fn(async (_name, args) => {
      const source = (args.p_items as Record<string, unknown>[])[0]
      return { results: [matchResult(source, 'ambiguous', { candidates: ['a', 'b'] })] }
    })
    const result = await executeCustomInventoryImport(preview(), gateway(runRpc))
    expect(runRpc).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ completed: false, failedStage: 'matching', ambiguousItemsCount: 1, insertedItemsCount: 0, insertedMovementsCount: 0 })
  })

  it('stops all writes when a matching chunk fails', async () => {
    const runRpc = vi.fn(async () => { throw new Error('network') })
    const result = await executeCustomInventoryImport(preview(), gateway(runRpc))
    expect(runRpc).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ completed: false, failedStage: 'matching', failedChunk: 1, completedChunks: 0 })
  })

  it('stops before movements when an item write chunk fails', async () => {
    const runRpc = vi.fn(async (name, args) => {
      if (name === 'match_inventory_items_chunk_rpc') {
        const source = (args.p_items as Record<string, unknown>[])[0]
        return { results: [matchResult(source)] }
      }
      return { inserted: 0, updated: 0, skipped: 1, errors: ['unsafe item'] }
    })
    const result = await executeCustomInventoryImport(preview(), gateway(runRpc))
    expect(runRpc).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ completed: false, failedStage: 'items', failedChunk: 1, completedChunks: 0 })
  })

  it('updates matched items by resolved ID and attaches it to movements', async () => {
    let itemPayload: Record<string, unknown> | undefined
    let movementPayload: Record<string, unknown> | undefined
    const mockGateway = gateway(async (name, args) => {
      if (name === 'match_inventory_items_chunk_rpc') {
        const source = (args.p_items as Record<string, unknown>[])[0]
        return { results: [matchResult(source, 'matched', { itemId: 'old-db-id', method: 'screw_business_identity' })] }
      }
      if (name === 'import_normalized_items_chunk_rpc') {
        itemPayload = (args.p_items as Record<string, unknown>[])[0]
        return {
          inserted: 0, updated: 1, skipped: 0, errors: [],
          item_results: [{ client_key: itemPayload.client_key, table_name: itemPayload.table_name, item_key: itemPayload.item_key, item_id: 'old-db-id', action: 'updated' }],
        }
      }
      movementPayload = (args.p_movements as Record<string, unknown>[])[0]
      return { inserted: 1, updated: 0, skipped: 0, errors: [] }
    })
    const result = await executeCustomInventoryImport(preview(), mockGateway)
    expect(itemPayload).toMatchObject({ resolved_item_id: 'old-db-id', match_status: 'matched' })
    expect(movementPayload).toMatchObject({ resolved_item_id: 'old-db-id', import_key: 'movement-1' })
    expect(result).toMatchObject({ insertedItemsCount: 0, updatedItemsCount: 1, matchedItemsCount: 1, matchedByBusinessIdentityCount: 1 })
    expect(mockGateway.generateInternalCode).not.toHaveBeenCalled()
  })

  it('reports accurate item chunk progress after matching', async () => {
    const items = Array.from({ length: CUSTOM_IMPORT_CHUNK_SIZES.items + 1 }, (_, index) => item(index))
    const progress: CustomImportProgress[] = []
    await executeCustomInventoryImport(preview({ items, movements: [] }), gateway(), (value) => progress.push(value))
    expect(progress.filter((value) => value.stage === 'items').at(-1)).toMatchObject({
      current: items.length, total: items.length, chunk: 2, totalChunks: 2,
    })
    expect(progress.at(-1)?.stage).toBe('complete')
  })

  it('a mocked second import inserts no items, movements, or custody', async () => {
    const secondRunGateway = gateway(async (name, args) => {
      if (name === 'match_inventory_items_chunk_rpc') {
        const source = (args.p_items as Record<string, unknown>[])[0]
        return { results: [matchResult(source, 'matched', { itemId: 'same-id', method: 'item_key' })] }
      }
      if (name === 'import_normalized_items_chunk_rpc') {
        const source = (args.p_items as Record<string, unknown>[])[0]
        return {
          inserted: 0, updated: 1, skipped: 0, errors: [],
          item_results: [{ client_key: source.client_key, table_name: source.table_name, item_key: source.item_key, item_id: 'same-id', action: 'updated' }],
        }
      }
      const values = (args.p_movements ?? args.p_records ?? []) as unknown[]
      return { inserted: 0, updated: 0, skipped: values.length, errors: [] }
    })
    const result = await executeCustomInventoryImport(preview(), secondRunGateway)
    expect(result).toMatchObject({ insertedItemsCount: 0, insertedMovementsCount: 0, insertedCustodyCount: 0 })
  })
})
