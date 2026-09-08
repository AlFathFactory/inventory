import { beforeEach, describe, expect, it, vi } from 'vitest'

const { isDesktopRuntimeMock, runPaginatedSnapshotSyncMock } = vi.hoisted(() => ({
  isDesktopRuntimeMock: vi.fn(),
  runPaginatedSnapshotSyncMock: vi.fn(),
}))

vi.mock('../../config/platform', () => ({ isDesktopRuntime: isDesktopRuntimeMock }))
vi.mock('./snapshotSync', () => ({
  runPaginatedSnapshotSync: runPaginatedSnapshotSyncMock,
}))

import { runInitialFullSync } from './fullSync'

describe('runInitialFullSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDesktopRuntimeMock.mockReturnValue(true)
    runPaginatedSnapshotSyncMock.mockResolvedValue({
      status: 'succeeded',
      snapshotCursor: '2026-09-07T12:00:00+00:00',
      pages: 4,
      rowCounts: { consumables: 10 },
      upsertedRows: 10,
      deletedRows: 0,
    })
  })

  it('is a no-op on the web runtime', async () => {
    isDesktopRuntimeMock.mockReturnValue(false)

    expect(await runInitialFullSync()).toEqual({ status: 'skipped' })
    expect(runPaginatedSnapshotSyncMock).not.toHaveBeenCalled()
  })

  it('loads the initial snapshot through the paginated path', async () => {
    const result = await runInitialFullSync()

    expect(runPaginatedSnapshotSyncMock).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      status: 'succeeded',
      nextCursor: '2026-09-07T12:00:00+00:00',
      upsertedRows: 10,
    })
  })

  it('surfaces a failed snapshot', async () => {
    runPaginatedSnapshotSyncMock.mockResolvedValue({
      status: 'failed',
      pages: 2,
      failedTable: 'inventory_operations',
      error: 'network down',
    })

    expect(await runInitialFullSync()).toEqual({ status: 'failed', error: 'network down' })
  })

  it('refuses to report success without a cursor', async () => {
    runPaginatedSnapshotSyncMock.mockResolvedValue({
      status: 'succeeded',
      pages: 1,
      upsertedRows: 0,
      deletedRows: 0,
    })

    expect(await runInitialFullSync()).toMatchObject({ status: 'failed' })
  })
})
