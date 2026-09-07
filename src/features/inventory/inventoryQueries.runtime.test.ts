import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryDefinition } from '../../config/categoryConfig'

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(),
  listCategoryRows: vi.fn(),
  getLocalItemDetails: vi.fn(),
  listItemMovements: vi.fn(),
  loadCategoryRows: vi.fn(),
  getItemDetails: vi.fn(),
  getItemMovements: vi.fn(),
  getCachedCategoryRows: vi.fn(),
  getCachedInventoryItem: vi.fn(),
}))

vi.mock('../../config/platform', () => ({ isDesktopRuntime: mocks.isDesktopRuntime }))
vi.mock('../../repositories', () => ({
  getInventoryRepository: async () => ({
    listCategoryRows: mocks.listCategoryRows,
    getItemDetails: mocks.getLocalItemDetails,
  }),
  getMovementsRepository: async () => ({
    listItemMovements: mocks.listItemMovements,
  }),
}))
vi.mock('../category/utils/categoryRows', () => ({ loadCategoryRows: mocks.loadCategoryRows }))
vi.mock('../../services/itemsService', () => ({
  getCustodyRecord: vi.fn(),
  getItemDetails: mocks.getItemDetails,
  getItemMovements: mocks.getItemMovements,
}))
vi.mock('../../services/offlineBootstrapService', () => ({
  getCachedCategoryRows: mocks.getCachedCategoryRows,
  getCachedInventoryItem: mocks.getCachedInventoryItem,
}))
vi.mock('../../lib/offlineDb', () => ({
  offlineDb: {
    offline_items: { get: vi.fn(), where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    offline_operations: {
      where: () => ({ equals: () => ({ filter: () => ({ toArray: async () => [] }), toArray: async () => [] }) }),
    },
  },
}))

import {
  categoryQueryOptions,
  itemQueryOptions,
  movementsQueryOptions,
} from './inventoryQueries'

const category = { table: 'consumables' } as CategoryDefinition

/** Runs the queryFn react-query would run. */
function run<T>(options: { queryFn?: unknown }): Promise<T> {
  const queryFn = options.queryFn as () => Promise<T>
  return queryFn()
}

describe('inventory read paths by runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('navigator', { onLine: true })
  })

  it('keeps the existing query keys', () => {
    expect(categoryQueryOptions(category).queryKey).toEqual(
      ['inventory', 'category', 'consumables'],
    )
    expect(itemQueryOptions('paints', 'i1').queryKey).toEqual(
      ['inventory', 'item', 'paints', 'i1'],
    )
    expect(movementsQueryOptions('paints', 'i1').queryKey).toEqual(
      ['inventory', 'movements', 'paints', 'i1'],
    )
  })

  describe('desktop', () => {
    beforeEach(() => mocks.isDesktopRuntime.mockReturnValue(true))

    it('reads category rows from SQLite and never from Supabase or the cache', async () => {
      mocks.listCategoryRows.mockResolvedValue({ data: [{ item_id: 'a' }], error: null })

      await expect(run(categoryQueryOptions(category))).resolves.toEqual([{ item_id: 'a' }])
      expect(mocks.loadCategoryRows).not.toHaveBeenCalled()
      expect(mocks.getCachedCategoryRows).not.toHaveBeenCalled()
    })

    it('surfaces a local category failure instead of falling back', async () => {
      mocks.listCategoryRows.mockResolvedValue({ data: null, error: 'database is locked' })

      await expect(run(categoryQueryOptions(category))).rejects.toThrow('database is locked')
      expect(mocks.getCachedCategoryRows).not.toHaveBeenCalled()
    })

    it('reads item details from SQLite', async () => {
      mocks.getLocalItemDetails.mockResolvedValue({ data: { item_id: 'i1' }, error: null })

      await expect(run(itemQueryOptions('paints', 'i1'))).resolves.toEqual({ item_id: 'i1' })
      expect(mocks.getItemDetails).not.toHaveBeenCalled()
    })

    it('distinguishes a missing local item from a read failure', async () => {
      mocks.getLocalItemDetails.mockResolvedValue({ data: null, error: null })

      await expect(run(itemQueryOptions('paints', 'missing')))
        .rejects.toThrow('الصنف غير موجود في البيانات المحلية')
    })

    it('reads movements from SQLite, empty list included', async () => {
      mocks.listItemMovements.mockResolvedValue({ data: [], error: null })

      await expect(run(movementsQueryOptions('paints', 'i1'))).resolves.toEqual([])
      expect(mocks.getItemMovements).not.toHaveBeenCalled()
    })

    it('does not swallow a movements failure into an empty list', async () => {
      mocks.listItemMovements.mockResolvedValue({ data: null, error: 'تعذر تحميل حركات الصنف محليًا' })

      await expect(run(movementsQueryOptions('paints', 'i1')))
        .rejects.toThrow('تعذر تحميل حركات الصنف محليًا')
    })
  })

  describe('web', () => {
    beforeEach(() => mocks.isDesktopRuntime.mockReturnValue(false))

    it('keeps using the Supabase loaders', async () => {
      mocks.loadCategoryRows.mockResolvedValue({ data: [{ item_id: 'web' }], error: null })
      mocks.getItemDetails.mockResolvedValue({ data: { item_id: 'web' }, error: null })
      mocks.getItemMovements.mockResolvedValue({ data: [{ id: 'm1' }], error: null })

      await expect(run(categoryQueryOptions(category))).resolves.toEqual([{ item_id: 'web' }])
      await expect(run(itemQueryOptions('paints', 'i1'))).resolves.toEqual({ item_id: 'web' })
      await expect(run(movementsQueryOptions('paints', 'i1'))).resolves.toEqual([{ id: 'm1' }])
      expect(mocks.listCategoryRows).not.toHaveBeenCalled()
      expect(mocks.listItemMovements).not.toHaveBeenCalled()
    })

    it('still falls back to the browser cache when offline', async () => {
      vi.stubGlobal('navigator', { onLine: false })
      mocks.getCachedCategoryRows.mockResolvedValue([{ item_id: 'cached' }])

      await expect(run(categoryQueryOptions(category))).resolves.toEqual([{ item_id: 'cached' }])
      await expect(run(movementsQueryOptions('paints', 'i1'))).resolves.toEqual([])
    })
  })
})
