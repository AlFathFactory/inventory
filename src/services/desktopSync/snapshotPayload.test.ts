import { describe, expect, it } from 'vitest'
import {
  parseSnapshotPage,
  SnapshotPageError,
  SnapshotVersionError,
  SUPPORTED_SNAPSHOT_PAGE_VERSION,
} from './snapshotPayload'
import { SYNC_TABLE_COLUMNS } from './syncTables'

const CURSOR = '2026-09-08T10:00:00.000000+00:00'

function basePage(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: SUPPORTED_SNAPSHOT_PAGE_VERSION,
    table: 'consumables',
    snapshot_cursor: CURSOR,
    rows: [],
    has_more: false,
    next_page_cursor: null,
    ...overrides,
  }
}

describe('parseSnapshotPage', () => {
  it('reduces rows to the mapped columns in bind order', () => {
    const page = parseSnapshotPage(basePage({
      rows: [{ id: 'c1', item_name: 'صنف', stock_balance: 5, unmapped_extra: 'ignored' }],
    }), 'consumables')

    const columns = SYNC_TABLE_COLUMNS.consumables as readonly string[]
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]).toHaveLength(columns.length)
    expect(page.rows[0][columns.indexOf('id')]).toBe('c1')
    expect(page.rows[0][columns.indexOf('item_name')]).toBe('صنف')
    expect(page.rows[0][columns.indexOf('stock_balance')]).toBe(5)
  })

  it('converts booleans to 0/1 for SQLite', () => {
    const page = parseSnapshotPage(basePage({
      table: 'long_welding_gloves',
      rows: [{ id: 'g1', is_archived: false }],
    }), 'long_welding_gloves')

    const columns = SYNC_TABLE_COLUMNS.long_welding_gloves as readonly string[]
    expect(page.rows[0][columns.indexOf('is_archived')]).toBe(0)
  })

  it('collects tombstone operation ids', () => {
    const page = parseSnapshotPage(basePage({
      table: 'inventory_operation_deletions',
      rows: [
        { id: 'd1', operation_id: 'op-1', deleted_at: CURSOR },
        { id: 'd2', operation_id: 'op-2', deleted_at: CURSOR },
      ],
    }), 'inventory_operation_deletions')

    expect(page.deletedOperationIds).toEqual(['op-1', 'op-2'])
  })

  it('carries pagination metadata through', () => {
    const page = parseSnapshotPage(basePage({
      rows: [{ id: 'c1' }],
      has_more: true,
      next_page_cursor: { updated_at: CURSOR, id: 'c1' },
    }), 'consumables')

    expect(page).toMatchObject({
      snapshotCursor: CURSOR,
      hasMore: true,
      nextPageCursor: { updated_at: CURSOR, id: 'c1' },
      rowCount: 1,
    })
  })

  it('accepts an empty page as a normal terminal page', () => {
    const page = parseSnapshotPage(basePage(), 'consumables')

    expect(page.rows).toEqual([])
    expect(page.hasMore).toBe(false)
    expect(page.nextPageCursor).toBeNull()
  })

  describe('rejections', () => {
    it('rejects an unsupported contract version', () => {
      expect(() => parseSnapshotPage(basePage({ schema_version: 2 }), 'consumables'))
        .toThrow(SnapshotVersionError)
    })

    it('rejects a page served for a different table', () => {
      expect(() => parseSnapshotPage(basePage({ table: 'paints' }), 'consumables'))
        .toThrow(/table mismatch/)
    })

    it('rejects a page with no snapshot cursor', () => {
      expect(() => parseSnapshotPage(basePage({ snapshot_cursor: null }), 'consumables'))
        .toThrow(SnapshotPageError)
    })

    it('rejects a row without a string id', () => {
      expect(() => parseSnapshotPage(basePage({ rows: [{ id: 42 }] }), 'consumables'))
        .toThrow(/missing a string id/)
    })

    it('rejects a tombstone without an operation id', () => {
      expect(() => parseSnapshotPage(basePage({
        table: 'inventory_operation_deletions',
        rows: [{ id: 'd1' }],
      }), 'inventory_operation_deletions')).toThrow(/operation_id/)
    })

    it('rejects has_more without a next cursor, which would loop forever', () => {
      expect(() => parseSnapshotPage(basePage({
        rows: [{ id: 'c1' }], has_more: true, next_page_cursor: null,
      }), 'consumables')).toThrow(/no next_page_cursor/)
    })

    it('rejects a non-array rows field', () => {
      expect(() => parseSnapshotPage(basePage({ rows: 'nope' }), 'consumables'))
        .toThrow(/must be an array/)
    })
  })
})
