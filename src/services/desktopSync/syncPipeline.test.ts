import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SUPPORTED_SYNC_PAYLOAD_VERSION } from './syncPayload'
import { SYNC_TABLE_NAMES } from './syncTables'

const {
  fetchDeltaMock,
  applyTransactionMock,
  markStartedMock,
  markSucceededMock,
  markFailedMock,
} = vi.hoisted(() => ({
  fetchDeltaMock: vi.fn(),
  applyTransactionMock: vi.fn(),
  markStartedMock: vi.fn(),
  markSucceededMock: vi.fn(),
  markFailedMock: vi.fn(),
}))

vi.mock('./syncClient', () => ({ fetchInventorySyncDelta: fetchDeltaMock }))
vi.mock('../../lib/localDb/transaction', () => ({ applySyncTransaction: applyTransactionMock }))
vi.mock('../../lib/localDb/syncState', () => ({
  markSyncStarted: markStartedMock,
  markSyncSucceeded: markSucceededMock,
  markSyncFailed: markFailedMock,
}))

import { runSyncPass } from './syncPipeline'

const NEXT_CURSOR = '2026-09-07T12:00:00+00:00'

function payload(tableOverrides: Record<string, unknown[]> = {}, cursor = NEXT_CURSOR) {
  const tables = Object.fromEntries(SYNC_TABLE_NAMES.map((table) => [table, []]))
  return {
    schema_version: SUPPORTED_SYNC_PAYLOAD_VERSION,
    since: null,
    next_cursor: cursor,
    tables: { ...tables, ...tableOverrides },
  }
}

describe('runSyncPass', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchDeltaMock.mockResolvedValue(payload())
    applyTransactionMock.mockResolvedValue({ upsertedRows: 0, deletedRows: 0 })
    markStartedMock.mockResolvedValue(undefined)
    markSucceededMock.mockResolvedValue(undefined)
    markFailedMock.mockResolvedValue(undefined)
  })

  it('passes the given cursor straight to the RPC', async () => {
    await runSyncPass('2026-09-01T00:00:00+00:00')

    expect(fetchDeltaMock).toHaveBeenCalledWith('2026-09-01T00:00:00+00:00')
  })

  it('applies the plan in one transaction, then stores the cursor', async () => {
    fetchDeltaMock.mockResolvedValue(payload({ projects: [{ id: 'p1', name: 'n' }] }))
    applyTransactionMock.mockResolvedValue({ upsertedRows: 1, deletedRows: 0 })

    const result = await runSyncPass('cursor-0')

    expect(result).toMatchObject({ status: 'succeeded', nextCursor: NEXT_CURSOR, upsertedRows: 1 })
    expect(applyTransactionMock).toHaveBeenCalledOnce()
    expect(markSucceededMock).toHaveBeenCalledWith(NEXT_CURSOR)
    expect(applyTransactionMock.mock.invocationCallOrder[0])
      .toBeLessThan(markSucceededMock.mock.invocationCallOrder[0])
  })

  it('advances the cursor for an empty delta with an empty plan', async () => {
    const result = await runSyncPass('cursor-0')

    expect(applyTransactionMock).toHaveBeenCalledWith({ upserts: [], deletedOperationIds: [] })
    expect(markSucceededMock).toHaveBeenCalledWith(NEXT_CURSOR)
    expect(result).toMatchObject({ status: 'succeeded', upsertedRows: 0 })
  })

  it('sends tombstones through the transaction', async () => {
    fetchDeltaMock.mockResolvedValue(payload({
      inventory_operation_deletions: [
        { id: 'd1', operation_id: 'op-1', deleted_at: '2026-09-05T00:00:00+00:00' },
      ],
    }))
    applyTransactionMock.mockResolvedValue({ upsertedRows: 1, deletedRows: 1 })

    const result = await runSyncPass('cursor-0')

    expect(applyTransactionMock.mock.calls[0][0].deletedOperationIds).toEqual(['op-1'])
    expect(result).toMatchObject({ status: 'succeeded', deletedRows: 1 })
  })

  it('builds an identical plan when the same delta is replayed', async () => {
    fetchDeltaMock.mockResolvedValue(payload({ projects: [{ id: 'p1', name: 'n' }] }))

    await runSyncPass('cursor-0')
    await runSyncPass('cursor-0')

    expect(applyTransactionMock.mock.calls[0][0]).toEqual(applyTransactionMock.mock.calls[1][0])
    expect(markFailedMock).not.toHaveBeenCalled()
  })

  it('keeps the previous cursor when the transaction rolls back', async () => {
    applyTransactionMock.mockRejectedValue(new Error('upsert failed: no such column'))

    const result = await runSyncPass('cursor-0')

    expect(result).toEqual({ status: 'failed', error: 'upsert failed: no such column' })
    expect(markSucceededMock).not.toHaveBeenCalled()
    expect(markFailedMock).toHaveBeenCalledOnce()
  })

  it('rejects a malformed payload before opening a transaction', async () => {
    fetchDeltaMock.mockResolvedValue({ schema_version: SUPPORTED_SYNC_PAYLOAD_VERSION })

    const result = await runSyncPass('cursor-0')

    expect(result.status).toBe('failed')
    expect(applyTransactionMock).not.toHaveBeenCalled()
    expect(markSucceededMock).not.toHaveBeenCalled()
  })

  it('rejects a schema-version mismatch before opening a transaction', async () => {
    fetchDeltaMock.mockResolvedValue({ ...payload(), schema_version: 99 })

    const result = await runSyncPass('cursor-0')

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error).toContain('schema_version')
    }
    expect(applyTransactionMock).not.toHaveBeenCalled()
    expect(markSucceededMock).not.toHaveBeenCalled()
  })

  it('records a remote failure without writing or advancing', async () => {
    fetchDeltaMock.mockRejectedValue(new Error('network down'))

    const result = await runSyncPass('cursor-0')

    expect(result).toEqual({ status: 'failed', error: 'network down' })
    expect(applyTransactionMock).not.toHaveBeenCalled()
    expect(markSucceededMock).not.toHaveBeenCalled()
  })
})
