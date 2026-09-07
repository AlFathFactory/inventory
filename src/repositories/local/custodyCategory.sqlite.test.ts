import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { SYNC_TABLE_COLUMNS, SYNC_TABLE_NAMES } from '../../services/desktopSync/syncTables'
import {
  buildCustodyCategoryListSql,
  buildCustodyRecordSql,
  isCustodyCategoryTable,
  toCustodyCategorySummaryItem,
  toCustodyRecord,
} from './custodyCategoryProjection'
import type { LocalRow } from './rowValues'

/**
 * Custody category projections against a real SQLite database built from the
 * shipped migrations, plus a drift check that every synced column actually
 * exists locally.
 */

const MIGRATIONS = [
  'v1_metadata',
  'v2_categories',
  'v2_stock_items',
  'v2_parties',
  'v2_operations',
  'v2_custody',
  'v3_custody_categories',
]

function migrationSql(name: string) {
  return readFileSync(
    fileURLToPath(new URL(`../../../src-tauri/src/db/migrations/${name}.sql`, import.meta.url)),
    'utf8',
  )
}

let db: DatabaseSync

function query(sql: string, ...bindings: string[]): LocalRow[] {
  return db.prepare(sql.replace(/\$\d+/g, '?')).all(...bindings).map((row) => ({ ...row }))
}

function columnsOf(table: string): string[] {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name))
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  for (const name of MIGRATIONS) db.exec(migrationSql(name))
})

describe('local schema vs sync mapping', () => {
  it('creates a local table for every synced table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row.name))

    for (const table of SYNC_TABLE_NAMES) {
      expect(tables).toContain(table)
    }
  })

  it('has every mapped sync column present in the local schema', () => {
    for (const table of SYNC_TABLE_NAMES) {
      const local = columnsOf(table)
      for (const column of SYNC_TABLE_COLUMNS[table] as readonly string[]) {
        expect(`${table}.${column}`).toBe(
          local.includes(column) ? `${table}.${column}` : `${table}.<missing ${column}>`,
        )
      }
    }
  })

  it('registers both custody category tables for sync', () => {
    expect(SYNC_TABLE_NAMES).toContain('cutting_discs')
    expect(SYNC_TABLE_NAMES).toContain('long_welding_gloves')
    expect(isCustodyCategoryTable('cutting_discs')).toBe(true)
    expect(isCustodyCategoryTable('long_welding_gloves')).toBe(true)
    expect(isCustodyCategoryTable('consumables')).toBe(false)
  })

  it('keeps the two custody tables asymmetric, matching the backend', () => {
    expect(columnsOf('cutting_discs')).toEqual(expect.arrayContaining(['code', 'scrapped_date']))
    expect(columnsOf('cutting_discs')).not.toContain('quantity')
    expect(columnsOf('cutting_discs')).not.toContain('is_archived')

    expect(columnsOf('long_welding_gloves')).toEqual(
      expect.arrayContaining(['quantity', 'is_archived']),
    )
    expect(columnsOf('long_welding_gloves')).not.toContain('code')
    expect(columnsOf('long_welding_gloves')).not.toContain('scrapped_date')
  })
})

describe('v2 to v3 upgrade', () => {
  it('adds the new tables and preserves existing v2 data', () => {
    const upgraded = new DatabaseSync(':memory:')
    // A database that only ever ran v1 + v2.
    for (const name of MIGRATIONS.filter((name) => !name.startsWith('v3'))) {
      upgraded.exec(migrationSql(name))
    }
    upgraded.exec(`
      INSERT INTO consumables (id, item_name, stock_balance) VALUES ('keep-1', 'صنف', 7);
      INSERT INTO inventory_operations (id, table_name, item_id, operation_type, quantity)
      VALUES ('keep-op', 'consumables', 'keep-1', 'add', 7);
      INSERT INTO metadata (key, value, updated_at) VALUES ('schema_version', '2', '2026-01-01T00:00:00Z');
    `)

    upgraded.exec(migrationSql('v3_custody_categories'))

    expect(upgraded.prepare('SELECT item_name, stock_balance FROM consumables WHERE id = ?').get('keep-1'))
      .toMatchObject({ item_name: 'صنف', stock_balance: 7 })
    expect(upgraded.prepare('SELECT id FROM inventory_operations').all()).toHaveLength(1)
    expect(upgraded.prepare('SELECT COUNT(*) c FROM cutting_discs').get()).toMatchObject({ c: 0 })
    expect(upgraded.prepare('SELECT COUNT(*) c FROM long_welding_gloves').get()).toMatchObject({ c: 0 })
    upgraded.close()
  })

  it('is re-runnable, so a partially applied upgrade is safe', () => {
    expect(() => {
      db.exec(migrationSql('v3_custody_categories'))
      db.exec(migrationSql('v3_custody_categories'))
    }).not.toThrow()
  })
})

describe('cutting discs projection', () => {
  beforeEach(() => {
    db.exec(`
      INSERT INTO cutting_discs (id, code, type_name, received_by, received_date, scrapped_date,
        source_file, source_sheet, created_at, updated_at, notes, internal_code, supplier_name)
      VALUES
        ('cd1', 'C-1', 'صاروخ كبير', 'أحمد', '2026-03-01', NULL, 'f.xlsx', 'صواريخ',
         '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', 'ملاحظة', 'CD-1', 'مورد'),
        ('cd2', 'C-2', 'صاروخ صغير', 'سعيد', '2026-05-01', '2026-06-01', NULL, 'صواريخ',
         NULL, NULL, NULL, 'CD-2', NULL)
    `)
  })

  it('orders by received date descending, like the web query', () => {
    const rows = query(buildCustodyCategoryListSql('cutting_discs'))
    expect(rows.map((row) => row.id)).toEqual(['cd2', 'cd1'])
  })

  it('produces the web summary shape, keeping the real timestamps', () => {
    const [row] = query(buildCustodyCategoryListSql('cutting_discs'))
      .filter((candidate) => candidate.id === 'cd1')
    const item = toCustodyCategorySummaryItem(row, 'cutting_discs')

    expect(item).toMatchObject({
      id: 'cd1',
      table_name: 'cutting_discs',
      category_name: 'صواريخ',
      item_id: 'cd1',
      item_name: 'صاروخ كبير',
      type_name: 'صاروخ كبير',
      code: 'C-1',
      received_by: 'أحمد',
      received_date: '2026-03-01',
      source_sheet: 'صواريخ',
      internal_code: 'CD-1',
      supplier_name: 'مورد',
      notes: 'ملاحظة',
      // mapCuttingDiscRows spreads the row, so timestamps survive.
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
      item_key: null,
      project_name: null,
      stock_balance: null,
      min_quantity: null,
      status: null,
      total_added: null,
      total_issued: null,
      source_rows_count: 1,
    })
  })

  it('reads one record by primary key without derived fields', () => {
    const rows = query(buildCustodyRecordSql('cutting_discs'), 'cd2')
    const record = toCustodyRecord(rows[0], 'cutting_discs')

    expect(record).toMatchObject({
      id: 'cd2',
      code: 'C-2',
      type_name: 'صاروخ صغير',
      scrapped_date: '2026-06-01',
    })
    expect(record).not.toHaveProperty('category_name')
    expect(query(buildCustodyRecordSql('cutting_discs'), 'missing')).toEqual([])
  })
})

describe('long welding gloves projection', () => {
  beforeEach(() => {
    db.exec(`
      INSERT INTO long_welding_gloves (id, type_name, received_by, received_date, source_file,
        source_sheet, created_at, updated_at, quantity, notes, is_archived, internal_code, supplier_name)
      VALUES
        ('g1', 'جوانتي', 'أحمد', '2026-03-01', 'f.xlsx', 'جوانتي',
         '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', 3, 'ملاحظة', 0, 'GL-1', 'مورد'),
        ('g2', 'جوانتي قديم', 'سعيد', '2026-05-01', NULL, NULL, NULL, NULL, 1, NULL, 1, 'GL-2', NULL)
    `)
  })

  it('hides archived gloves and orders by received date descending', () => {
    const rows = query(buildCustodyCategoryListSql('long_welding_gloves'))
    expect(rows.map((row) => row.id)).toEqual(['g1'])
  })

  it('produces the web summary shape, with timestamps nulled like mapGloveRows', () => {
    const rows = query(buildCustodyCategoryListSql('long_welding_gloves'))
    const item = toCustodyCategorySummaryItem(rows[0], 'long_welding_gloves')

    expect(item).toMatchObject({
      id: 'g1',
      table_name: 'long_welding_gloves',
      category_name: 'جوانتي لحام طويل',
      item_id: 'g1',
      item_name: 'جوانتي',
      type_name: 'جوانتي',
      received_by: 'أحمد',
      received_date: '2026-03-01',
      internal_code: 'GL-1',
      supplier_name: 'مورد',
      notes: 'ملاحظة',
      source_rows_count: 1,
    })
    // The web mapper nulls these and omits the remaining columns entirely.
    expect(item.created_at).toBeNull()
    expect(item.updated_at).toBeNull()
    expect(item).not.toHaveProperty('quantity')
    expect(item).not.toHaveProperty('is_archived')
    expect(item).not.toHaveProperty('source_sheet')
  })

  it('keeps quantity and the archive flag on the raw record read', () => {
    const rows = query(buildCustodyRecordSql('long_welding_gloves'), 'g2')
    const record = toCustodyRecord(rows[0], 'long_welding_gloves')

    expect(record).toMatchObject({ id: 'g2', quantity: 1, is_archived: 1 })
  })
})
