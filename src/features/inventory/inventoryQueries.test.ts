import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OfflineOperation } from '../../lib/offlineDb'

const mocks = vi.hoisted(() => ({
  getCachedInventoryItem: vi.fn(),
  getCachedCategoryRows: vi.fn(),
  getLocalItem: vi.fn(),
  getOperations: vi.fn(),
}))

vi.mock('../../services/offlineBootstrapService', () => ({
  getCachedCategoryRows: mocks.getCachedCategoryRows,
  getCachedInventoryItem: mocks.getCachedInventoryItem,
}))

vi.mock('../../lib/offlineDb', () => ({
  offlineDb: {
    offline_items: {
      get: mocks.getLocalItem,
      where: vi.fn(),
    },
    offline_operations: {
      where: () => ({
        equals: () => ({
          filter: () => ({ toArray: mocks.getOperations }),
          toArray: mocks.getOperations,
        }),
      }),
    },
  },
}))

vi.mock('../../services/itemsService', () => ({
  getCustodyRecord: vi.fn(),
  getItemDetails: vi.fn(),
  getItemMovements: vi.fn(),
}))

vi.mock('../category/utils/categoryRows', () => ({
  loadCategoryRows: vi.fn(),
}))

import { getProjectedCachedInventoryItem } from './inventoryQueries'

afterEach(() => {
  vi.clearAllMocks()
})

describe('getProjectedCachedInventoryItem', () => {
  it('loads any item directly from the persistent snapshot and applies queued movements', async () => {
    mocks.getCachedInventoryItem.mockResolvedValue({
      table_name: 'consumables',
      category_name: 'Consumables',
      item_id: 'item-2',
      item_key: 'consumables:item-2',
      project_name: 'Factory',
      item_name: 'Second item',
      stock_balance: 10,
      min_quantity: 0,
      status: 'safe',
      total_added: 10,
      total_issued: 0,
      source_rows_count: 1,
      updated_at: null,
      created_at: null,
    })
    mocks.getLocalItem.mockResolvedValue(undefined)
    mocks.getOperations.mockResolvedValue([{
      id: 'operation-1',
      requestId: 'request-1',
      tableName: 'consumables',
      itemId: 'item-2',
      localItemId: null,
      operationType: 'issue',
      quantity: 3,
      baseUpdatedAt: null,
      payload: {},
      status: 'pending',
      errorMessage: null,
      createdAt: '2026-08-29T00:00:00.000Z',
      syncedAt: null,
    } satisfies OfflineOperation])

    await expect(getProjectedCachedInventoryItem('consumables', 'item-2'))
      .resolves.toMatchObject({
        item_id: 'item-2',
        item_name: 'Second item',
        stock_balance: 7,
        offline_state: 'pending',
      })
  })

  it('returns null without waiting for a server when the item is not cached', async () => {
    mocks.getCachedInventoryItem.mockResolvedValue(null)
    mocks.getLocalItem.mockResolvedValue(undefined)
    mocks.getOperations.mockResolvedValue([])

    await expect(getProjectedCachedInventoryItem('consumables', 'missing'))
      .resolves.toBeNull()
  })
})
