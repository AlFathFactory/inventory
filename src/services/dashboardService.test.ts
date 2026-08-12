import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabaseClient: { rpc: (...args: unknown[]) => rpcMock(...args) },
  getSupabaseConfigError: () => 'not configured',
}))

import { getDashboardData } from './dashboardService'

function buildPayload() {
  return {
    total_imported_files: 2,
    last_imported_file: 'july.xlsx',
    category_counts: {
      consumables: 5,
      paints: 1,
    },
    dynamic_category_counts: [
      { category_id: 'category-1', category_name: 'مخزن اللحام', row_count: 2 },
    ],
    inventory_rows: [
      {
        table_name: 'consumables',
        id: 'legacy-1',
        item_name: 'صنف قديم',
        project: 'قسم 1',
        transaction_date: '2026-08-10',
        stock_balance: 5,
        min_quantity: 1,
        updated_at: '2026-08-10T00:00:00Z',
      },
      {
        table_name: 'inventory_items',
        id: 'dynamic-1',
        item_name: 'صنف ديناميكي منتهي',
        project: 'قسم 2',
        stock_balance: 0,
        min_quantity: 2,
        category_id: 'category-1',
        category_name: 'مخزن اللحام',
        updated_at: '2026-08-12T00:00:00Z',
      },
      {
        table_name: 'inventory_items',
        id: 'dynamic-2',
        item_name: 'صنف ديناميكي آمن',
        project: 'قسم 2',
        stock_balance: 20,
        min_quantity: 2,
        category_id: 'category-1',
        category_name: 'مخزن اللحام',
        updated_at: '2026-08-13T00:00:00Z',
      },
    ],
  }
}

describe('getDashboardData', () => {
  beforeEach(() => {
    rpcMock.mockReset()
  })

  it('includes dynamic rows/counts alongside unaffected legacy output', async () => {
    rpcMock.mockResolvedValue({ data: buildPayload(), error: null })

    const data = await getDashboardData()

    // legacy category cards keep their exact original counts
    const consumablesCard = data.categoryCards.find((card) => card.key === 'consumables')
    expect(consumablesCard?.rowCount).toBe(5)

    // dynamic category gets its own card using the real category name
    const dynamicCard = data.categoryCards.find((card) => card.key === 'category-1')
    expect(dynamicCard?.label).toBe('مخزن اللحام')
    expect(dynamicCard?.rowCount).toBe(2)
    expect(dynamicCard?.route).toBe('/dynamic-categories/category-1/items')

    // totals include dynamic categories/rows
    expect(data.stats.totalCategories).toBe(6) // 5 legacy + 1 dynamic
    expect(data.stats.totalMainRows).toBe(3) // 1 legacy + 2 dynamic
    expect(data.stats.outOfStockItemsCount).toBe(1)

    const dynamicRows = data.inventoryRows.filter((row) => row.categoryKey === 'dynamic')
    expect(dynamicRows).toHaveLength(2)
    expect(dynamicRows.map((row) => row.categoryLabel)).toEqual([
      'مخزن اللحام',
      'مخزن اللحام',
    ])
    expect(dynamicRows.find((row) => row.itemId === 'dynamic-1')?.status).toBe('out')
    expect(dynamicRows.find((row) => row.itemId === 'dynamic-2')?.status).toBe('safe')

    const legacyRow = data.inventoryRows.find((row) => row.itemId === 'legacy-1')
    expect(legacyRow?.categoryKey).toBe('consumables')
    expect(legacyRow?.categoryId).toBeNull()
  })

  it('keeps legacy-only behavior when no dynamic data is returned', async () => {
    rpcMock.mockResolvedValue({
      data: {
        total_imported_files: 0,
        last_imported_file: null,
        category_counts: { consumables: 1 },
        inventory_rows: [
          {
            table_name: 'consumables',
            id: 'legacy-only',
            item_name: 'صنف',
            stock_balance: 4,
            min_quantity: 1,
            updated_at: '2026-08-01T00:00:00Z',
          },
        ],
      },
      error: null,
    })

    const data = await getDashboardData()

    expect(data.stats.totalCategories).toBe(5)
    expect(data.stats.totalMainRows).toBe(1)
    expect(data.inventoryRows.every((row) => row.categoryKey !== 'dynamic')).toBe(true)
    expect(data.categoryCards.every((card) => card.categoryId == null)).toBe(true)
  })
})
