import { describe, expect, it } from 'vitest'
import { parseSyncPayload, SUPPORTED_SYNC_PAYLOAD_VERSION } from './syncPayload'
import { buildSyncWritePlan } from './syncWriter'
import { SYNC_TABLE_COLUMNS, SYNC_TABLE_NAMES } from './syncTables'

/**
 * End-to-end payload → write-plan coverage for the two custody category
 * tables, using the exact field names `get_inventory_sync_delta_rpc` emits
 * (it returns `to_jsonb(t)`, so every table column appears).
 */

const CUTTING_DISC_ROW = {
  id: '8f1d0f5e-0000-4000-8000-000000000001',
  code: 'C-1',
  type_name: 'صاروخ',
  received_by: 'أحمد',
  received_date: '2026-03-01',
  scrapped_date: null,
  source_file: 'f.xlsx',
  source_sheet: 'صواريخ',
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-02-01T00:00:00+00:00',
  notes: 'ملاحظة',
  internal_code: 'CD-1',
  supplier_name: 'مورد',
}

const GLOVE_ROW = {
  id: '8f1d0f5e-0000-4000-8000-000000000002',
  type_name: 'جوانتي',
  received_by: 'سعيد',
  received_date: '2026-04-01',
  source_file: null,
  source_sheet: 'جوانتي',
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: '2026-02-01T00:00:00+00:00',
  quantity: 3,
  notes: null,
  is_archived: false,
  internal_code: 'GL-1',
  supplier_name: null,
}

function payload(overrides: Record<string, unknown[]> = {}) {
  const tables = Object.fromEntries(SYNC_TABLE_NAMES.map((table) => [table, []]))
  return {
    schema_version: SUPPORTED_SYNC_PAYLOAD_VERSION,
    next_cursor: '2026-09-07T10:00:00+00:00',
    tables: { ...tables, ...overrides },
  }
}

describe('custody category sync', () => {
  it('is registered for sync with the columns the RPC returns', () => {
    expect(SYNC_TABLE_COLUMNS.cutting_discs).toEqual([
      'id', 'code', 'type_name', 'received_by', 'received_date', 'scrapped_date',
      'source_file', 'source_sheet', 'created_at', 'updated_at', 'notes', 'internal_code',
      'supplier_name',
    ])
    expect(SYNC_TABLE_COLUMNS.long_welding_gloves).toEqual([
      'id', 'type_name', 'received_by', 'received_date', 'source_file', 'source_sheet',
      'created_at', 'updated_at', 'quantity', 'notes', 'is_archived', 'internal_code',
      'supplier_name',
    ])
    // Every mapped column must exist on the RPC row.
    for (const column of SYNC_TABLE_COLUMNS.cutting_discs) {
      expect(CUTTING_DISC_ROW).toHaveProperty(column)
    }
    for (const column of SYNC_TABLE_COLUMNS.long_welding_gloves) {
      expect(GLOVE_ROW).toHaveProperty(column)
    }
  })

  it('maps a full sync payload into bind rows in column order', () => {
    const snapshot = parseSyncPayload(payload({
      cutting_discs: [CUTTING_DISC_ROW],
      long_welding_gloves: [GLOVE_ROW],
    }))

    expect(snapshot.rowCounts.cutting_discs).toBe(1)
    expect(snapshot.rowCounts.long_welding_gloves).toBe(1)
    expect(snapshot.tables.cutting_discs[0]).toEqual([
      CUTTING_DISC_ROW.id, 'C-1', 'صاروخ', 'أحمد', '2026-03-01', null, 'f.xlsx', 'صواريخ',
      '2026-01-01T00:00:00+00:00', '2026-02-01T00:00:00+00:00', 'ملاحظة', 'CD-1', 'مورد',
    ])
    // Postgres booleans become SQLite 0/1.
    expect(snapshot.tables.long_welding_gloves[0]).toEqual([
      GLOVE_ROW.id, 'جوانتي', 'سعيد', '2026-04-01', null, 'جوانتي',
      '2026-01-01T00:00:00+00:00', '2026-02-01T00:00:00+00:00', 3, null, 0, 'GL-1', null,
    ])
  })

  it('builds upserts for both tables in a delta', () => {
    const snapshot = parseSyncPayload(payload({
      cutting_discs: [CUTTING_DISC_ROW],
      long_welding_gloves: [GLOVE_ROW],
    }))

    const plan = buildSyncWritePlan(snapshot)
    const tables = plan.upserts.map((upsert) => upsert.table)

    expect(tables).toContain('cutting_discs')
    expect(tables).toContain('long_welding_gloves')
    for (const upsert of plan.upserts) {
      for (const row of upsert.rows) {
        expect(row).toHaveLength(upsert.columns.length)
      }
    }
  })

  it('replays a delta into an identical plan, so repeated sync is idempotent', () => {
    const build = () => buildSyncWritePlan(parseSyncPayload(payload({
      cutting_discs: [CUTTING_DISC_ROW],
      long_welding_gloves: [GLOVE_ROW],
    })))

    expect(build()).toEqual(build())
  })

  it('produces no upserts for these tables when the delta is empty', () => {
    const plan = buildSyncWritePlan(parseSyncPayload(payload()))

    expect(plan.upserts.map((upsert) => upsert.table))
      .not.toContain('cutting_discs')
  })

  it('rejects a payload that omits the new tables rather than silently skipping', () => {
    const broken = payload()
    delete (broken.tables as Record<string, unknown>).cutting_discs

    expect(() => parseSyncPayload(broken)).toThrow('cutting_discs')
  })
})
