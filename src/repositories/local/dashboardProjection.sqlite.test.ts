import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildDashboardCountSql,
  buildDashboardRowsSql,
  DASHBOARD_COUNT_TABLES,
  DYNAMIC_CATEGORY_COUNTS_SQL,
  DYNAMIC_ROWS_SQL,
  toDashboardRow,
  toDynamicCategoryCount,
  toDynamicDashboardRow,
} from './dashboardProjection'
import type { LocalRow } from './rowValues'

/**
 * Runs the dashboard projection against a real SQLite database built from the
 * shipped migrations, so the SQL is proven to parse and to produce the same
 * envelope `get_inventory_dashboard_summary_rpc` returns.
 */

const MIGRATIONS = ['v2_categories', 'v2_stock_items']

function migrationSql(name: string) {
  return readFileSync(
    fileURLToPath(new URL(`../../../src-tauri/src/db/migrations/${name}.sql`, import.meta.url)),
    'utf8',
  )
}

let db: DatabaseSync

function query(sql: string): LocalRow[] {
  return db.prepare(sql).all().map((row) => ({ ...row }))
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  for (const name of MIGRATIONS) db.exec(migrationSql(name))
})

describe('dashboard projection', () => {
  it('counts every legacy category table the dashboard cards use', () => {
    db.exec(`
      INSERT INTO consumables (id, item_name) VALUES ('c1','a'), ('c2','b');
      INSERT INTO paints (id, item_name) VALUES ('p1','a');
      INSERT INTO screws (id, item_name) VALUES ('s1','a');
    `)

    const counts = Object.fromEntries(
      DASHBOARD_COUNT_TABLES.map((table) => [
        table,
        Number(query(buildDashboardCountSql(table))[0].row_count),
      ]),
    )

    expect(counts).toEqual({
      consumables: 2, paints: 1, screws: 1, stock_screws: 0, raw_materials: 0,
    })
  })

  it('drops null fields, mirroring jsonb_strip_nulls', () => {
    db.exec(`
      INSERT INTO consumables (id, item_name, project, stock_balance, min_quantity,
        internal_code, supplier_name, transaction_date, updated_at)
      VALUES ('c1','صنف',NULL,5,2,'CN-1',NULL,NULL,'2026-09-01T00:00:00Z')
    `)

    const [row] = query(buildDashboardRowsSql('consumables'))
    const projected = toDashboardRow(row, 'consumables')

    expect(projected).toMatchObject({
      id: 'c1',
      item_name: 'صنف',
      stock_balance: 5,
      min_quantity: 2,
      internal_code: 'CN-1',
      table_name: 'consumables',
    })
    // Null columns are absent rather than present-as-null.
    expect(projected).not.toHaveProperty('project')
    expect(projected).not.toHaveProperty('supplier_name')
    expect(projected).not.toHaveProperty('transaction_date')
  })

  it('carries the raw-material measurement fields the dashboard shows', () => {
    db.exec(`
      INSERT INTO raw_materials (id, item_name, stock_balance, min_quantity,
        weight, length, width, th, dimension_text, din, code_number, material_source)
      VALUES ('r1','صاج',12,3,7.5,200,100,2,'200x100x2','DIN 933','CD-9','محلي')
    `)

    const projected = toDashboardRow(query(buildDashboardRowsSql('raw_materials'))[0], 'raw_materials')

    expect(projected).toMatchObject({
      weight: 7.5, length: 200, width: 100, th: 2,
      dimension_text: '200x100x2', din: 'DIN 933', code_number: 'CD-9',
      material_source: 'محلي', table_name: 'raw_materials',
    })
  })

  it('resolves dynamic item categories and excludes archived rows', () => {
    db.exec(`
      INSERT INTO categories (id, name) VALUES ('cat1','كهرباء');
      INSERT INTO inventory_items (id, category_id, item_name, source_sheet, stock_balance, min_quantity, is_archived)
      VALUES ('d1','cat1','كابل','ورقة',5,1,0),
             ('d2','missing','مفتاح','ورقة أخرى',5,1,0),
             ('d3','cat1','محذوف','ورقة',5,1,1)
    `)

    const rows = query(DYNAMIC_ROWS_SQL).map(toDynamicDashboardRow)

    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.id === 'd1')?.category_name).toBe('كهرباء')
    // Falls back to source_sheet when the category is missing.
    expect(rows.find((r) => r.id === 'd2')?.category_name).toBe('ورقة أخرى')
    expect(rows.every((r) => r.table_name === 'inventory_items')).toBe(true)
  })

  it('groups dynamic category counts, ignoring archived items', () => {
    db.exec(`
      INSERT INTO categories (id, name) VALUES ('cat1','كهرباء');
      INSERT INTO inventory_items (id, category_id, item_name, is_archived)
      VALUES ('d1','cat1','a',0), ('d2','cat1','b',0), ('d3','cat1','c',1)
    `)

    const counts = query(DYNAMIC_CATEGORY_COUNTS_SQL).map(toDynamicCategoryCount)

    expect(counts).toEqual([
      { category_id: 'cat1', category_name: 'كهرباء', row_count: 2 },
    ])
  })

  it('returns empty aggregates for an unsynced database rather than failing', () => {
    expect(query(DYNAMIC_ROWS_SQL)).toEqual([])
    expect(query(DYNAMIC_CATEGORY_COUNTS_SQL)).toEqual([])
    expect(Number(query(buildDashboardCountSql('consumables'))[0].row_count)).toBe(0)
  })

  it('rejects a table with no dashboard projection', () => {
    expect(() => buildDashboardRowsSql('employees')).toThrow('employees')
    expect(() => buildDashboardCountSql('employees')).toThrow('employees')
  })
})
