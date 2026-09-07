import { beforeEach, describe, expect, it, vi } from 'vitest'

const { isDesktopRuntimeMock, runSyncPassMock } = vi.hoisted(() => ({
  isDesktopRuntimeMock: vi.fn(),
  runSyncPassMock: vi.fn(),
}))

vi.mock('../../config/platform', () => ({ isDesktopRuntime: isDesktopRuntimeMock }))
vi.mock('./syncPipeline', () => ({ runSyncPass: runSyncPassMock }))

import { runInitialFullSync } from './fullSync'

describe('runInitialFullSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDesktopRuntimeMock.mockReturnValue(true)
    runSyncPassMock.mockResolvedValue({
      status: 'succeeded',
      nextCursor: '2026-09-07T12:00:00+00:00',
      rowCounts: {},
      upsertedRows: 10,
      deletedRows: 0,
    })
  })

  it('is a no-op on the web runtime', async () => {
    isDesktopRuntimeMock.mockReturnValue(false)

    expect(await runInitialFullSync()).toEqual({ status: 'skipped' })
    expect(runSyncPassMock).not.toHaveBeenCalled()
  })

  it('requests a full snapshot with a null cursor', async () => {
    const result = await runInitialFullSync()

    expect(runSyncPassMock).toHaveBeenCalledWith(null)
    expect(result).toMatchObject({ status: 'succeeded', upsertedRows: 10 })
  })

  it('surfaces a failed pass', async () => {
    runSyncPassMock.mockResolvedValue({ status: 'failed', error: 'network down' })

    expect(await runInitialFullSync()).toEqual({ status: 'failed', error: 'network down' })
  })
})
