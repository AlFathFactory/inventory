import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SUPPORTED_SYNC_PAYLOAD_VERSION } from './syncPayload'
import { SYNC_TABLE_NAMES } from './syncTables'

const {
  isDesktopRuntimeMock,
  fetchDeltaMock,
  withTransactionMock,
  applySnapshotMock,
  markStartedMock,
  markSucceededMock,
  markFailedMock,
} = vi.hoisted(() => ({
  isDesktopRuntimeMock: vi.fn(),
  fetchDeltaMock: vi.fn(),
  withTransactionMock: vi.fn(),
  applySnapshotMock: vi.fn(),
  markStartedMock: vi.fn(),
  markSucceededMock: vi.fn(),
  markFailedMock: vi.fn(),
}))

vi.mock('../../config/platform', () => ({ isDesktopRuntime: isDesktopRuntimeMock }))
vi.mock('./syncClient', () => ({ fetchInventorySyncDelta: fetchDeltaMock }))
vi.mock('./syncWriter', () => ({ applySyncSnapshot: applySnapshotMock }))
vi.mock('../../lib/localDb/transaction', () => ({ withTransaction: withTransactionMock }))
vi.mock('../../lib/localDb/syncState', () => ({
  markSyncStarted: markStartedMock,
  markSyncSucceeded: markSucceededMock,
  markSyncFailed: markFailedMock,
}))

import { runInitialFullSync } from './fullSync'

const NEXT_CURSOR = '2026-09-07T10:00:00+00:00'

function payload(tableOverrides: Record<string, unknown[]> = {}) {
  const tables = Object.fromEntries(SYNC_TABLE_NAMES.map((table) => [table, []]))
  return {
    schema_version: SUPPORTED_SYNC_PAYLOAD_VERSION,
    since: null,
    next_cursor: NEXT_CURSOR,
    tables: { ...tables, ...tableOverrides },
  }
}

/** Mimics the real helper: run the work, propagate failures. */
const realTransaction = (work: (db: unknown) => Promise<unknown>) => work({ execute: vi.fn() })

describe('runInitialFullSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDesktopRuntimeMock.mockReturnValue(true)
    fetchDeltaMock.mockResolvedValue(payload())
    withTransactionMock.mockImplementation(realTransaction)
    applySnapshotMock.mockResolvedValue(undefined)
    markStartedMock.mockResolvedValue(undefined)
    markSucceededMock.mockResolvedValue(undefined)
    markFailedMock.mockResolvedValue(undefined)
  })

  it('is a no-op on the web runtime', async () => {
    isDesktopRuntimeMock.mockReturnValue(false)

    expect(await runInitialFullSync()).toEqual({ status: 'skipped' })
    expect(markStartedMock).not.toHaveBeenCalled()
    expect(fetchDeltaMock).not.toHaveBeenCalled()
  })

  it('requests a full snapshot with a null cursor', async () => {
    await runInitialFullSync()

    expect(fetchDeltaMock).toHaveBeenCalledWith(null)
  })

  it('applies a snapshot then stores the cursor, in order', async () => {
    fetchDeltaMock.mockResolvedValue(payload({
      projects: [{ id: 'p1', name: 'n', status: 'active' }],
    }))

    const result = await runInitialFullSync()

    expect(result).toMatchObject({ status: 'succeeded', nextCursor: NEXT_CURSOR })
    expect(markStartedMock).toHaveBeenCalledOnce()
    expect(applySnapshotMock).toHaveBeenCalledOnce()
    expect(markSucceededMock).toHaveBeenCalledWith(NEXT_CURSOR)
    expect(markFailedMock).not.toHaveBeenCalled()
    // The cursor must be written only after the write completed.
    expect(applySnapshotMock.mock.invocationCallOrder[0])
      .toBeLessThan(markSucceededMock.mock.invocationCallOrder[0])
  })

  it('reports per-table row counts', async () => {
    fetchDeltaMock.mockResolvedValue(payload({
      projects: [{ id: 'p1' }, { id: 'p2' }],
    }))

    const result = await runInitialFullSync()

    expect(result).toMatchObject({ status: 'succeeded' })
    if (result.status === 'succeeded') {
      expect(result.rowCounts.projects).toBe(2)
      expect(result.rowCounts.employees).toBe(0)
    }
  })

  it('is safe to repeat: a second identical run reapplies the same snapshot', async () => {
    fetchDeltaMock.mockResolvedValue(payload({ projects: [{ id: 'p1', name: 'n' }] }))

    const first = await runInitialFullSync()
    const second = await runInitialFullSync()

    expect(first).toEqual(second)
    expect(applySnapshotMock).toHaveBeenCalledTimes(2)
    expect(applySnapshotMock.mock.calls[0][1]).toEqual(applySnapshotMock.mock.calls[1][1])
    expect(markFailedMock).not.toHaveBeenCalled()
  })

  it('rolls back and keeps the cursor when a write fails mid-sync', async () => {
    const failure = new Error('disk full')
    applySnapshotMock.mockRejectedValue(failure)

    const result = await runInitialFullSync()

    expect(result).toEqual({ status: 'failed', error: 'disk full' })
    expect(markFailedMock).toHaveBeenCalledWith(failure)
    expect(markSucceededMock).not.toHaveBeenCalled()
  })

  it('does not open a transaction when the response is malformed', async () => {
    fetchDeltaMock.mockResolvedValue({ schema_version: 3, next_cursor: null })

    const result = await runInitialFullSync()

    expect(result.status).toBe('failed')
    expect(withTransactionMock).not.toHaveBeenCalled()
    expect(applySnapshotMock).not.toHaveBeenCalled()
    expect(markSucceededMock).not.toHaveBeenCalled()
    expect(markFailedMock).toHaveBeenCalledOnce()
  })

  it('handles a schema-version mismatch without writing anything', async () => {
    fetchDeltaMock.mockResolvedValue(payload({}))
    fetchDeltaMock.mockResolvedValue({ ...payload(), schema_version: 99 })

    const result = await runInitialFullSync()

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error).toContain('schema_version')
    }
    expect(withTransactionMock).not.toHaveBeenCalled()
    expect(markSucceededMock).not.toHaveBeenCalled()
  })

  it('records remote failures without advancing the cursor', async () => {
    fetchDeltaMock.mockRejectedValue(new Error('network down'))

    const result = await runInitialFullSync()

    expect(result).toEqual({ status: 'failed', error: 'network down' })
    expect(withTransactionMock).not.toHaveBeenCalled()
    expect(markSucceededMock).not.toHaveBeenCalled()
    expect(markFailedMock).toHaveBeenCalledOnce()
  })
})
