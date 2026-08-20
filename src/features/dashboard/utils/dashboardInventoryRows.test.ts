import { describe, expect, it } from 'vitest'
import { categoryConfig } from '../../../config/categoryConfig'
import type { InventoryRow } from '../../../services/inventoryService'
import {
  buildDashboardInventoryRows,
  buildDynamicDashboardInventoryRows,
} from './dashboardInventoryRows'

function makeDynamicRow(overrides: Partial<InventoryRow> = {}): InventoryRow {
  return {
    table_name: 'inventory_items',
    id: 'item-1',
    internal_code: 'DC001-001',
    item_name: 'رول تغليف',
    project: 'خط الإنتاج',
    stock_balance: 10,
    min_quantity: 3,
    supplier_name: 'المورد الرئيسي',
    updated_at: '2026-08-13T10:00:00Z',
    category_id: 'category-1',
    category_name: 'مخزن اللحام',
    ...overrides,
  }
}

describe('buildDynamicDashboardInventoryRows', () => {
  it('normalizes a dynamic row using the real category name and id', () => {
    const [row] = buildDynamicDashboardInventoryRows([makeDynamicRow()])

    expect(row.categoryKey).toBe('dynamic')
    expect(row.categoryId).toBe('category-1')
    expect(row.categoryLabel).toBe('مخزن اللحام')
    expect(row.itemId).toBe('item-1')
    expect(row.internalCode).toBe('DC001-001')
    expect(row.itemName).toBe('رول تغليف')
    expect(row.projectName).toBe('خط الإنتاج')
    expect(row.stockBalance).toBe(10)
    expect(row.minQuantity).toBe(3)
  })

  it('falls back to a generic label when the category is missing', () => {
    const [row] = buildDynamicDashboardInventoryRows([
      makeDynamicRow({ category_name: undefined, category_id: undefined }),
    ])

    expect(row.categoryLabel).toBe('غير مصنف')
    expect(row.categoryId).toBeNull()
  })

  it('maps status using the same out/low/safe rule as legacy rows', () => {
    const [outRow, lowRow, safeRow] = buildDynamicDashboardInventoryRows([
      makeDynamicRow({ id: 'out', stock_balance: 0, min_quantity: 3 }),
      makeDynamicRow({ id: 'low', stock_balance: 3, min_quantity: 3 }),
      makeDynamicRow({ id: 'safe', stock_balance: 10, min_quantity: 3 }),
    ])

    expect(outRow.status).toBe('out')
    expect(lowRow.status).toBe('low')
    expect(safeRow.status).toBe('safe')
  })

  it('includes the dynamic category name and internal code in search text', () => {
    const [row] = buildDynamicDashboardInventoryRows([makeDynamicRow()])

    expect(row.searchText).toContain('مخزن اللحام')
    expect(row.searchText).toContain('dc001-001')
    expect(row.searchText).toContain('رول تغليف')
  })
})

describe('buildDashboardInventoryRows', () => {
  it('preserves screw metadata used by the operations matrix', () => {
    const [row] = buildDashboardInventoryRows([{
      categoryKey: 'screws',
      category: categoryConfig.screws,
      rows: [{
        id: 'screw-1',
        item_name: 'M12 × 50',
        project: 'قسم التجميع',
        din: 'DIN 933',
        code_number: 'SC-1250',
        stock_balance: 20,
        min_quantity: 5,
      }],
    }])

    expect(row.projectName).toBe('قسم التجميع')
    expect(row.itemName).toBe('M12 × 50')
    expect(row.din).toBe('DIN 933')
    expect(row.codeNumber).toBe('SC-1250')
    expect(row.searchText).toContain('din 933')
    expect(row.searchText).toContain('sc-1250')
  })
})
