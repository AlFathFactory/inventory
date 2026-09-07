import { beforeEach, describe, expect, it, vi } from 'vitest'

const { isDesktopRuntimeMock, getSyncStateMock, runSyncPassMock } = vi.hoisted(() => ({
  isDesktopRuntimeMock: vi.fn(),
  getSyncStateMock: vi.fn(),
  runSyncPassMock: vi.fn(),
}))

vi.mock('../../config/platform', () => ({ isDesktopRuntime: isDesktopRuntimeMock }))
vi.mock('../../lib/localDb/syncState', () => ({ getSyncState: getSyncStateMock }))
vi.mock('./syncPipeline', () => ({ runSyncPass: runSyncPassMock }))

import { runDeltaSync } from './deltaSync'

function syncState(cursor: string | null) {
  return {
    schemaVersion: '2',
    status: cursor ? ('succeeded' as const) : ('idle' as const),
    cursor,
    lastSuccessfulSyncAt: cursor ? '2026-09-07T11:00:00+00:00' : null,
    lastSyncStartedAt: null,
    lastError: null,
  }
}

describe('runDeltaSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDesktopRuntimeMock.mockReturnValue(true)
    getSyncStateMock.mockResolvedValue(syncState('2026-09-07T11:00:00+00:00'))
    runSyncPassMock.mockResolvedValue({
      status: 'succeeded',
      nextCursor: '2026-09-07T12:00:00+00:00',
      rowCounts: {},
      upsertedRows: 3,
      deletedRows: 1,
    })
  })

  it('is a no-op on the web runtime', async () => {
    isDesktopRuntimeMock.mockReturnValue(false)

    expect(await runDeltaSync()).toEqual({ status: 'skipped' })
    expect(getSyncStateMock).not.toHaveBeenCalled()
    expect(runSyncPassMock).not.toHaveBeenCalled()
  })

  it('requires a full sync when no cursor is stored yet', async () => {
    getSyncStateMock.mockResolvedValue(syncState(null))

    expect(await runDeltaSync()).toEqual({ status: 'requires_full_sync' })
    expect(runSyncPassMock).not.toHaveBeenCalled()
  })

  it('runs a delta pass from the stored cursor after a full sync', async () => {
    const result = await runDeltaSync()

    expect(runSyncPassMock).toHaveBeenCalledWith('2026-09-07T11:00:00+00:00')
    expect(result).toMatchObject({
      status: 'succeeded',
      nextCursor: '2026-09-07T12:00:00+00:00',
      upsertedRows: 3,
      deletedRows: 1,
    })
  })

  it('reports an empty delta as a success that still advances the cursor', async () => {
    runSyncPassMock.mockResolvedValue({
      status: 'succeeded',
      nextCursor: '2026-09-07T12:30:00+00:00',
      rowCounts: {},
      upsertedRows: 0,
      deletedRows: 0,
    })

    expect(await runDeltaSync()).toMatchObject({
      status: 'succeeded',
      nextCursor: '2026-09-07T12:30:00+00:00',
      upsertedRows: 0,
    })
  })

  it('reads the cursor fresh on every run, so repeats advance', async () => {
    getSyncStateMock
      .mockResolvedValueOnce(syncState('cursor-1'))
      .mockResolvedValueOnce(syncState('cursor-2'))

    await runDeltaSync()
    await runDeltaSync()

    expect(runSyncPassMock.mock.calls.map(([cursor]) => cursor)).toEqual(['cursor-1', 'cursor-2'])
  })

  it('surfaces a failed pass without touching the cursor itself', async () => {
    runSyncPassMock.mockResolvedValue({ status: 'failed', error: 'network down' })

    expect(await runDeltaSync()).toEqual({ status: 'failed', error: 'network down' })
  })
})
