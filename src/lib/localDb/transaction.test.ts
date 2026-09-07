import { afterEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn()

vi.mock('../../config/platform', () => ({
  isDesktopRuntime: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

const PLAN = {
  upserts: [{ table: 'projects', columns: ['id', 'name'], rows: [['p1', 'n']] }],
  deletedOperationIds: ['op-1'],
}

describe('applySyncTransaction', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('throws on the web runtime without invoking the command', async () => {
    const { isDesktopRuntime } = await import('../../config/platform')
    vi.mocked(isDesktopRuntime).mockReturnValue(false)

    const { applySyncTransaction } = await import('./transaction')

    await expect(applySyncTransaction(PLAN)).rejects.toThrow(/desktop runtime/i)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('delegates the whole plan to Rust in a single call', async () => {
    const { isDesktopRuntime } = await import('../../config/platform')
    vi.mocked(isDesktopRuntime).mockReturnValue(true)
    invokeMock.mockResolvedValue({ upsertedRows: 1, deletedRows: 1 })

    const { applySyncTransaction } = await import('./transaction')
    const report = await applySyncTransaction(PLAN)

    // One atomic hand-off: no JS-side BEGIN/COMMIT that could interleave.
    expect(invokeMock).toHaveBeenCalledOnce()
    expect(invokeMock).toHaveBeenCalledWith('apply_sync_transaction', { plan: PLAN })
    expect(report).toEqual({ upsertedRows: 1, deletedRows: 1 })
  })

  it('propagates a rejected transaction so the caller can mark it failed', async () => {
    const { isDesktopRuntime } = await import('../../config/platform')
    vi.mocked(isDesktopRuntime).mockReturnValue(true)
    invokeMock.mockRejectedValue('upsert into `projects` failed: no such column')

    const { applySyncTransaction } = await import('./transaction')

    await expect(applySyncTransaction(PLAN)).rejects.toBe(
      'upsert into `projects` failed: no such column',
    )
  })
})
