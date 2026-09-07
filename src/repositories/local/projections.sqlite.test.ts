import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildCategorySummarySql,
  buildItemDetailsSql,
  toCategorySummaryItem,
} from './categorySummaryProjection'
import {
  collectIssueIds,
  ITEM_MOVEMENTS_SQL,
  toItemMovement,
} from './movementsProjection'
import type { LocalRow } from './rowValues'

/**
 * Runs the projections against a real SQLite database built from the shipped
 * v2 migrations, so the generated SQL is proven to parse and to derive the
 * same values the Postgres views derive — not just to look right as a string.
 */

const MIGRATIONS = ['v2_categories', 'v2_stock_items', 'v2_operations']

function migrationSql(name: string) {
  return readFileSync(
    fileURLToPath(new URL(`../../../src-tauri/src/db/migrations/${name}.sql`, import.meta.url)),
    'utf8',
  )
}

let db: DatabaseSync

/** node:sqlite binds anonymous parameters positionally; sqlx uses `$n`. */
function query(sql: string, ...bindings: string[]): LocalRow[] {
  const rows = db.prepare(sql.replace(/\$\d+/g, '?')).all(...bindings)
  return rows.map((row) => ({ ...row }))
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  for (const name of MIGRATIONS) db.exec(migrationSql(name))
})

describe('category summary projection', () => {
  it('derives status, category name and source_rows_count, and hides archived rows', () => {
    db.exec(`
      INSERT INTO consumables (id, item_name, project, stock_balance, min_quantity, total_added, total_issued, supplier_name, internal_code, is_archived)
      VALUES ('b', 'قفازات', 'مصنع', 2, 5, 10, 8, 'مورد', 'CN-2', 0),
             ('a', 'أسلاك', 'مصنع', 0, 1, 4, 4, NULL, 'CN-1', 0),
             ('c', 'شريط', 'مصنع', 50, 5, 60, 10, NULL, 'CN-3', 0),
             ('d', 'محذوف', 'مصنع', 9, 1, 9, 0, NULL, 'CN-4', 1)
    `)

    const items = query(buildCategorySummarySql('consumables'))
      .map((row) => toCategorySummaryItem(row, 'consumables'))

    expect(items.map((item) => item.item_id)).toEqual(['a', 'c', 'b'])
    expect(items.map((item) => item.status)).toEqual(['منتهي', 'آمن', 'قليل'])
    expect(items.every((item) => item.category_name === 'مستهلكات')).toBe(true)
    expect(items.every((item) => item.source_rows_count === 1)).toBe(true)
    expect(items.map((item) => item.item_id)).not.toContain('d')
  })

  it('treats a null balance as out of stock, exactly like the view', () => {
    db.exec("INSERT INTO consumables (id, item_name) VALUES ('a', 'بدون رصيد')")

    const [item] = query(buildCategorySummarySql('consumables'))
      .map((row) => toCategorySummaryItem(row, 'consumables'))

    expect(item.status).toBe('منتهي')
    expect(item.stock_balance).toBeNull()
  })

  it('carries raw-material dimensions, codes and dimension_text', () => {
    db.exec(`
      INSERT INTO raw_materials (id, item_name, stock_balance, min_quantity, weight, length, width, th,
        material_source, code_number, din, dimension_text, internal_code)
      VALUES ('r1', 'صاج', 12, 3, 7.5, 200, 100, 2, 'محلي', 'CD-9', 'DIN 933', '200x100x2', 'RM-1')
    `)

    const [item] = query(buildCategorySummarySql('raw_materials'))
      .map((row) => toCategorySummaryItem(row, 'raw_materials'))

    expect(item).toMatchObject({
      table_name: 'raw_materials',
      category_name: 'خامات',
      weight: 7.5,
      length: 200,
      width: 100,
      th: 2,
      material_source: 'محلي',
      code_number: 'CD-9',
      din: 'DIN 933',
      dimension_text: '200x100x2',
      internal_code: 'RM-1',
      status: 'آمن',
    })
  })

  it('carries paint production and expiry dates', () => {
    db.exec(`
      INSERT INTO paints (id, item_name, stock_balance, min_quantity, expire_date, production_date)
      VALUES ('p1', 'دهان', 4, 4, '2027-01-01', '2026-01-01')
    `)

    const [item] = query(buildCategorySummarySql('paints'))
      .map((row) => toCategorySummaryItem(row, 'paints'))

    expect(item).toMatchObject({
      category_name: 'الدهانات',
      expire_date: '2027-01-01',
      production_date: '2026-01-01',
      status: 'قليل',
    })
  })

  it('resolves dynamic item categories, falling back to the source sheet', () => {
    db.exec(`
      INSERT INTO categories (id, name) VALUES ('cat1', 'كهرباء');
      INSERT INTO inventory_items (id, category_id, item_name, source_sheet, stock_balance, min_quantity)
      VALUES ('d1', 'cat1', 'كابل', 'ورقة', 5, 1),
             ('d2', 'missing', 'مفتاح', 'ورقة أخرى', 5, 1)
    `)

    const items = query(buildCategorySummarySql('inventory_items'))
      .map((row) => toCategorySummaryItem(row, 'inventory_items'))

    expect(items.find((item) => item.item_id === 'd1')?.category_name).toBe('كهرباء')
    expect(items.find((item) => item.item_id === 'd2')?.category_name).toBe('ورقة أخرى')
  })

  it('resolves a single item by primary key with the same derived fields', () => {
    db.exec(`
      INSERT INTO screws (id, item_name, stock_balance, min_quantity, code_number, din)
      VALUES ('s1', 'مسمار', 1, 4, 'CN', 'DIN 912')
    `)

    const rows = query(buildItemDetailsSql('screws'), 's1')
    const item = toCategorySummaryItem(rows[0], 'screws')

    expect(rows).toHaveLength(1)
    expect(item).toMatchObject({
      table_name: 'screws',
      category_name: 'مسامير',
      item_id: 's1',
      status: 'قليل',
      code_number: 'CN',
      din: 'DIN 912',
      source_rows_count: 1,
    })
  })

  it('returns nothing for an item that is not synced locally', () => {
    expect(query(buildItemDetailsSql('screws'), 'missing')).toEqual([])
  })
})

describe('item movements projection', () => {
  beforeEach(() => {
    db.exec(`
      INSERT INTO screws (id, item_name, supplier_name, code_number, din, internal_code)
      VALUES ('i1', 'مسمار', 'مورد الصنف', 'CODE-1', 'DIN 912', 'SC-1');

      INSERT INTO inventory_operations
        (id, table_name, item_id, operation_type, quantity, operation_date, created_at,
         category_label, issued_to, issue_code, item_code, related_operation_id, supplier_name)
      VALUES
        ('op1', 'screws', 'i1', 'add',    100, '2026-01-01', '2026-01-01T00:00:00Z', 'مسامير', NULL, NULL, NULL, NULL, 'مورد العملية'),
        ('op2', 'screws', 'i1', 'issue',   40, '2026-01-02', '2026-01-02T00:00:00Z', 'مسامير', 'أحمد', 'IS-9', NULL, NULL, NULL),
        ('op3', 'screws', 'i1', 'return',  15, '2026-01-03', '2026-01-03T00:00:00Z', 'مسامير', NULL, NULL, NULL, 'op2', NULL),
        ('op4', 'screws', 'i1', 'issue',   10, '2026-01-04', '2026-01-04T00:00:00Z', 'مسامير', 'سعيد', 'IS-10', NULL, NULL, NULL),
        ('op5', 'screws', 'i1', 'return',  10, '2026-01-05', '2026-01-05T00:00:00Z', 'مسامير', NULL, NULL, NULL, 'op4', NULL),
        ('opX', 'screws', 'other', 'add',  99, '2026-01-06', '2026-01-06T00:00:00Z', 'مسامير', NULL, NULL, NULL, NULL, NULL)
    `)
  })

  function movements() {
    const rows = query(ITEM_MOVEMENTS_SQL, 'screws', 'i1')
    return rows.map((row) => toItemMovement(row, []))
  }

  it('returns only the requested item movements, newest first', () => {
    expect(movements().map((movement) => movement.id))
      .toEqual(['op5', 'op4', 'op3', 'op2', 'op1'])
  })

  it('computes the running totals in operation order', () => {
    const byId = new Map(movements().map((movement) => [movement.id, movement]))

    expect(byId.get('op1')).toMatchObject({
      added_quantity: 100,
      issued_quantity: 0,
      total_added_until_operation: 100,
      total_issued_until_operation: 0,
    })
    expect(byId.get('op4')).toMatchObject({
      total_added_until_operation: 100,
      total_issued_until_operation: 50,
    })
  })

  it('derives partial and full return state for issues', () => {
    const byId = new Map(movements().map((movement) => [movement.id, movement]))

    expect(byId.get('op2')).toMatchObject({
      returned_quantity: 15,
      returnedQuantity: 15,
      returnStatus: 'partially_returned',
      remaining_returnable_quantity: 25,
      remainingReturnableQuantity: 25,
    })
    expect(byId.get('op4')).toMatchObject({
      returnStatus: 'fully_returned',
      remainingReturnableQuantity: 0,
    })
  })

  it('leaves additions and returns marked as not returned', () => {
    const byId = new Map(movements().map((movement) => [movement.id, movement]))

    expect(byId.get('op1')).toMatchObject({
      returnStatus: 'not_returned',
      remaining_returnable_quantity: 0,
    })
    // A return row reports its own quantity as returned.
    expect(byId.get('op3')).toMatchObject({
      returned_quantity: 15,
      returnStatus: 'not_returned',
    })
  })

  it('carries the original issue details onto the return row', () => {
    const byId = new Map(movements().map((movement) => [movement.id, movement]))

    expect(byId.get('op3')).toMatchObject({
      related_operation_id: 'op2',
      relatedOperationId: 'op2',
      original_issued_to: 'أحمد',
      original_issue_date: '2026-01-02',
      original_issue_code: 'IS-9',
    })
    expect(byId.get('op1')?.original_issued_to).toBeNull()
  })

  it('falls back to the item row for supplier, code and internal code', () => {
    const byId = new Map(movements().map((movement) => [movement.id, movement]))

    // The operation's own supplier wins where it has one.
    expect(byId.get('op1')?.supplier_name).toBe('مورد العملية')
    expect(byId.get('op2')).toMatchObject({
      supplier_name: 'مورد الصنف',
      code_number: 'CODE-1',
      internal_code: 'SC-1',
    })
  })

  it('reports the category name from the operation label', () => {
    expect(movements()[0].category_name).toBe('مسامير')
  })

  it('finds the issue rows that can carry allocations', () => {
    expect(collectIssueIds(query(ITEM_MOVEMENTS_SQL, 'screws', 'i1'))).toEqual(['op4', 'op2'])
  })

  it('returns an empty list for an item with no local movements', () => {
    expect(query(ITEM_MOVEMENTS_SQL, 'screws', 'unknown')).toEqual([])
  })
})
