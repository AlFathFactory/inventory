import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  itemGet: vi.fn(),
  itemDelete: vi.fn(),
  operationToArray: vi.fn(),
  operationBulkDelete: vi.fn(),
  transaction: vi.fn(async (...args: unknown[]) => {
    const callback = args.at(-1) as () => Promise<unknown>
    return callback()
  }),
}))

vi.mock('../lib/offlineDb', () => ({
  offlineDb: {
    offline_items: {
      get: dbMocks.itemGet,
      delete: dbMocks.itemDelete,
    },
    offline_operations: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: dbMocks.operationToArray,
        })),
      })),
      bulkDelete: dbMocks.operationBulkDelete,
    },
    transaction: dbMocks.transaction,
  },
}))

import { discardOfflineItem } from './offlineQueueService'

describe('discardOfflineItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('atomically removes a failed item and its unresolved dependent operations', async () => {
    dbMocks.itemGet.mockResolvedValue({ localId: 'local-item-1', status: 'failed' })
    dbMocks.operationToArray.mockResolvedValue([
      { id: 'blocked-operation', status: 'blocked' },
      { id: 'failed-operation', status: 'failed' },
      { id: 'synced-operation', status: 'synced' },
    ])

    await expect(discardOfflineItem('local-item-1')).resolves.toEqual({
      discarded: true,
      discardedOperationCount: 2,
    })
    expect(dbMocks.operationBulkDelete).toHaveBeenCalledWith([
      'blocked-operation',
      'failed-operation',
    ])
    expect(dbMocks.itemDelete).toHaveBeenCalledWith('local-item-1')
  })

  it('does not remove anything while a dependent operation is syncing', async () => {
    dbMocks.itemGet.mockResolvedValue({ localId: 'local-item-1', status: 'failed' })
    dbMocks.operationToArray.mockResolvedValue([
      { id: 'syncing-operation', status: 'syncing' },
    ])

    await expect(discardOfflineItem('local-item-1')).resolves.toEqual({
      discarded: false,
      discardedOperationCount: 0,
    })
    expect(dbMocks.operationBulkDelete).not.toHaveBeenCalled()
    expect(dbMocks.itemDelete).not.toHaveBeenCalled()
  })

  it('protects records that have already synced', async () => {
    dbMocks.itemGet.mockResolvedValue({ localId: 'local-item-1', status: 'synced' })

    await expect(discardOfflineItem('local-item-1')).resolves.toEqual({
      discarded: false,
      discardedOperationCount: 0,
    })
    expect(dbMocks.operationToArray).not.toHaveBeenCalled()
    expect(dbMocks.operationBulkDelete).not.toHaveBeenCalled()
    expect(dbMocks.itemDelete).not.toHaveBeenCalled()
  })
})
