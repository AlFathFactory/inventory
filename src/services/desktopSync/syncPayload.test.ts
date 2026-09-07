import { describe, expect, it } from 'vitest'
import {
  SUPPORTED_SYNC_PAYLOAD_VERSION,
  SyncPayloadError,
  SyncSchemaVersionError,
  parseSyncPayload,
  toBindValue,
} from './syncPayload'
import { SYNC_TABLE_NAMES } from './syncTables'

function buildPayload(overrides: Record<string, unknown> = {}) {
  const tables = Object.fromEntries(SYNC_TABLE_NAMES.map((table) => [table, []]))
  return {
    schema_version: SUPPORTED_SYNC_PAYLOAD_VERSION,
    since: null,
    next_cursor: '2026-09-07T10:00:00+00:00',
    tables,
    ...overrides,
  }
}

describe('parseSyncPayload', () => {
  it('accepts an empty full snapshot', () => {
    const snapshot = parseSyncPayload(buildPayload())

    expect(snapshot.nextCursor).toBe('2026-09-07T10:00:00+00:00')
    expect(snapshot.deletedOperationIds).toEqual([])
    expect(Object.keys(snapshot.tables).sort()).toEqual([...SYNC_TABLE_NAMES].sort())
  })

  it('maps rows to the mapped columns in bind order and preserves ids/timestamps', () => {
    const payload = buildPayload({
      tables: {
        ...buildPayload().tables,
        projects: [{
          id: 'a1b2', name: 'قسم', code: 'P-1', status: 'active', notes: null,
          created_at: '2026-01-01T00:00:00.123456+00:00',
          updated_at: '2026-02-02T00:00:00.500000+00:00',
          ignored_extra_column: 'dropped',
        }],
      },
    })

    expect(parseSyncPayload(payload).tables.projects).toEqual([[
      'a1b2', 'قسم', 'P-1', 'active', null,
      '2026-01-01T00:00:00.123456+00:00', '2026-02-02T00:00:00.500000+00:00',
    ]])
  })

  it('collects tombstone operation ids', () => {
    const payload = buildPayload({
      tables: {
        ...buildPayload().tables,
        inventory_operation_deletions: [
          { id: 'd1', operation_id: 'op-1', deleted_at: '2026-03-01T00:00:00+00:00' },
          { id: 'd2', operation_id: 'op-2', deleted_at: '2026-03-02T00:00:00+00:00' },
        ],
      },
    })

    expect(parseSyncPayload(payload).deletedOperationIds).toEqual(['op-1', 'op-2'])
  })

  it('rejects a schema-version mismatch with a distinct error', () => {
    expect(() => parseSyncPayload(buildPayload({ schema_version: 4 })))
      .toThrow(SyncSchemaVersionError)
  })

  it.each([
    ['a non-object payload', 'nope'],
    ['a missing cursor', buildPayload({ next_cursor: null })],
    ['a missing tables object', buildPayload({ tables: null })],
  ])('rejects %s', (_label, payload) => {
    expect(() => parseSyncPayload(payload)).toThrow(SyncPayloadError)
  })

  it('rejects a table that is not an array', () => {
    expect(() => parseSyncPayload(buildPayload({
      tables: { ...buildPayload().tables, employees: {} },
    }))).toThrow(/employees" must be an array/)
  })

  it('rejects a row without a string id', () => {
    expect(() => parseSyncPayload(buildPayload({
      tables: { ...buildPayload().tables, employees: [{ name: 'no id' }] },
    }))).toThrow(/missing a string id/)
  })

  it('rejects a tombstone without an operation_id', () => {
    expect(() => parseSyncPayload(buildPayload({
      tables: {
        ...buildPayload().tables,
        inventory_operation_deletions: [{ id: 'd1', deleted_at: 'x' }],
      },
    }))).toThrow(/missing a string operation_id/)
  })
})

describe('toBindValue', () => {
  it('converts booleans to SQLite integers', () => {
    expect(toBindValue(true)).toBe(1)
    expect(toBindValue(false)).toBe(0)
  })

  it('passes through strings, numbers and null', () => {
    expect(toBindValue('2026-01-01T00:00:00+00:00')).toBe('2026-01-01T00:00:00+00:00')
    expect(toBindValue(12.5)).toBe(12.5)
    expect(toBindValue(null)).toBeNull()
    expect(toBindValue(undefined)).toBeNull()
  })
})
