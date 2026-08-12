import { describe, expect, it } from 'vitest'
import type { InventoryRow } from '../../../services/inventoryService'
import { mapDynamicLowStockRows } from './lowStockRows'

function makeRow(overrides: Partial<InventoryRow> = {}): InventoryRow {
  return {
    id: 'item-1',
    item_name: 'رول تغليف',
    project: 'خط الإنتاج',
    stock_balance: 2,
    min_quantity: 3,
    internal_code: 'DC001-001',
    category_id: 'category-1',
    category_name: 'مخزن اللحام',
    transaction_date: '2026-08-10',
    updated_at: '2026-08-10T00:00:00Z',
    ...overrides,
  }
}

describe('mapDynamicLowStockRows', () => {
  it('normalizes a dynamic row with the real category name and a navigable itemId/categoryId', () => {
    const [row] = mapDynamicLowStockRows([makeRow()])

    expect(row.categoryKey).toBe('dynamic')
    expect(row.categoryId).toBe('category-1')
    expect(row.categoryLabel).toBe('مخزن اللحام')
    expect(row.itemId).toBe('item-1')
    expect(row.itemName).toBe('رول تغليف')
    expect(row.stockBalance).toBe(2)
    expect(row.minQuantity).toBe(3)
    expect(row.status).toBe('low')
  })

  it('excludes rows that are actually safe (defensive, mirrors legacy mapper)', () => {
    const rows = mapDynamicLowStockRows([makeRow({ stock_balance: 10, min_quantity: 3 })])
    expect(rows).toHaveLength(0)
  })

  it('classifies zero balance as out of stock, consistent with the shared status rule', () => {
    const [row] = mapDynamicLowStockRows([makeRow({ stock_balance: 0 })])
    expect(row.status).toBe('out')
  })

  it('falls back to a generic label when the category is missing', () => {
    const [row] = mapDynamicLowStockRows([
      makeRow({ category_name: undefined, category_id: undefined }),
    ])
    expect(row.categoryLabel).toBe('غير مصنف')
    expect(row.categoryId).toBeNull()
  })

  it('includes the dynamic category name and internal code in search text', () => {
    const [row] = mapDynamicLowStockRows([makeRow()])
    expect(row.searchText).toContain('مخزن اللحام')
    expect(row.searchText).toContain('dc001-001')
    expect(row.searchText).toContain('رول تغليف')
  })
})
