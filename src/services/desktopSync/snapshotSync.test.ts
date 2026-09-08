import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_PAGES_PER_TABLE,
  runPaginatedSnapshotSync,
  SNAPSHOT_TABLE_ORDER,
} from './snapshotSync'
import { SYNC_TABLE_COLUMNS, SYNC_TABLE_NAMES, type SyncTableName } from './syncTables'

const CURSOR = '2026-09-08T10:00:00.000000+00:00'

/** Builds a server page response for `table`. */
function page(options: {
  table: SyncTableName
  rows?: Array<Record<string, unknown>>
  hasMore?: boolean
  next?: { updated_at: string; id: string } | null
  snapshotCursor?: string
}) {
  const rows = options.rows ?? []
  return {
    schema_version: 1,
    table: options.table,
    snapshot_cursor: options.snapshotCursor ?? CURSOR,
    page_size: 500,
    row_count: rows.length,
    rows,
    has_more: options.hasMore ?? false,
    next_page_cursor: options.next ?? null,
  }
}

function row(table: SyncTableName, id: string): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  for (const column of SYNC_TABLE_COLUMNS[table] as readonly string[]) {
    record[column] = null
  }
  record.id = id
  if (table === 'inventory_operation_deletions') record.operation_id = `op-${id}`
  return record
}

function createHarness(options: { emptyEverything?: boolean } = {}) {
  const applied: Array<{ table: string; rows: number; deleted: number }> = []
  const fetchPage = vi.fn(async (params: { table: SyncTableName }) =>
    options.emptyEverything ? page({ table: params.table }) : page({ table: params.table }))
  const applyPlan = vi.fn(async (plan: {
    upserts: Array<{ table: string; rows: unknown[] }>
    deletedOperationIds: string[]
  }) => {
    for (const upsert of plan.upserts) {
      applied.push({ table: upsert.table, rows: upsert.rows.length, deleted: 0 })
    }
    if (plan.deletedOperationIds.length > 0) {
      applied.push({
        table: 'tombstones', rows: 0, deleted: plan.deletedOperationIds.length,
      })
    }
    return {
      upsertedRows: plan.upserts.reduce((sum, u) => sum + u.rows.length, 0),
      deletedRows: plan.deletedOperationIds.length,
    }
  })
  const onStarted = vi.fn(async () => {})
  const onSucceeded = vi.fn(async (_cursor: string) => {})
  const onFailed = vi.fn(async (_error: unknown) => {})

  return {
    applied,
    fetchPage,
    applyPlan,
    onStarted,
    onSucceeded,
    onFailed,
    run: () => runPaginatedSnapshotSync({
      fetchPage, applyPlan, onStarted, onSucceeded, onFailed,
    }),
  }
}

describe('runPaginatedSnapshotSync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads every synced table, tombstones last', async () => {
    const harness = createHarness()

    const result = await harness.run()

    expect(result.status).toBe('succeeded')
    const requested = harness.fetchPage.mock.calls.map((call) => call[0].table)
    expect(requested).toEqual(SNAPSHOT_TABLE_ORDER)
    expect([...SYNC_TABLE_NAMES].sort()).toEqual([...requested].sort())
    expect(requested.at(-1)).toBe('inventory_operation_deletions')
  })

  it('mints the cursor on the first page and reuses it for every later page', async () => {
    const harness = createHarness()

    await harness.run()

    expect(harness.fetchPage.mock.calls[0][0].snapshotCursor).toBeNull()
    for (const [params] of harness.fetchPage.mock.calls.slice(1)) {
      expect(params.snapshotCursor).toBe(CURSOR)
    }
    expect(harness.onSucceeded).toHaveBeenCalledWith(CURSOR)
  })

  it('follows the keyset cursor across multiple pages of one table', async () => {
    const harness = createHarness()
    harness.fetchPage.mockImplementation(async (params) => {
      if (params.table !== 'consumables') return page({ table: params.table })
      if (!params.after) {
        return page({
          table: 'consumables',
          rows: [row('consumables', 'a'), row('consumables', 'b')],
          hasMore: true,
          next: { updated_at: '2026-09-01T00:00:00+00:00', id: 'b' },
        })
      }
      return page({ table: 'consumables', rows: [row('consumables', 'c')] })
    })

    const result = await harness.run()

    expect(result.status).toBe('succeeded')
    expect(result.rowCounts?.consumables).toBe(3)
    const consumableCalls = harness.fetchPage.mock.calls
      .filter(([p]) => p.table === 'consumables')
    expect(consumableCalls).toHaveLength(2)
    expect(consumableCalls[1][0].after).toEqual({
      updated_at: '2026-09-01T00:00:00+00:00', id: 'b',
    })
  })

  it('handles empty tables without writing anything', async () => {
    const harness = createHarness({ emptyEverything: true })

    const result = await harness.run()

    expect(result.status).toBe('succeeded')
    expect(harness.applyPlan).not.toHaveBeenCalled()
    expect(harness.onSucceeded).toHaveBeenCalledWith(CURSOR)
  })

  it('both stores tombstone rows and applies them as deletions', async () => {
    const harness = createHarness()
    harness.fetchPage.mockImplementation(async (params) =>
      params.table === 'inventory_operation_deletions'
        ? page({
            table: 'inventory_operation_deletions',
            rows: [row('inventory_operation_deletions', 'd1')],
          })
        : page({ table: params.table }))

    const result = await harness.run()

    expect(result.status).toBe('succeeded')
    const plan = harness.applyPlan.mock.calls.at(-1)?.[0]
    // Stored, so a snapshot leaves the same local state a delta would.
    expect(plan?.upserts).toEqual([
      expect.objectContaining({ table: 'inventory_operation_deletions' }),
    ])
    expect(plan?.deletedOperationIds).toEqual(['op-d1'])
  })

  describe('failure and cursor safety', () => {
    it('never advances the cursor when a page fetch fails mid-snapshot', async () => {
      const harness = createHarness()
      harness.fetchPage.mockImplementation(async (params) => {
        if (params.table === 'employees') throw new Error('network down')
        return page({ table: params.table })
      })

      const result = await harness.run()

      expect(result).toMatchObject({
        status: 'failed', failedTable: 'employees', error: 'network down',
      })
      expect(harness.onSucceeded).not.toHaveBeenCalled()
      expect(harness.onFailed).toHaveBeenCalledOnce()
    })

    it('never advances the cursor when a local write fails', async () => {
      const harness = createHarness()
      harness.fetchPage.mockImplementation(async (params) =>
        page({ table: params.table, rows: [row(params.table, 'x')] }))
      harness.applyPlan.mockRejectedValueOnce(new Error('database is locked'))

      const result = await harness.run()

      expect(result).toMatchObject({ status: 'failed', error: 'database is locked' })
      expect(harness.onSucceeded).not.toHaveBeenCalled()
    })

    it('rejects a snapshot whose cursor changes mid-run', async () => {
      const harness = createHarness()
      let served = 0
      harness.fetchPage.mockImplementation(async (params) => {
        served += 1
        return page({
          table: params.table,
          snapshotCursor: served === 1 ? CURSOR : '2026-09-09T00:00:00.000000+00:00',
        })
      })

      const result = await harness.run()

      expect(result.status).toBe('failed')
      expect(result.error).toContain('cursor changed mid-run')
      expect(harness.onSucceeded).not.toHaveBeenCalled()
    })

    it('rejects a page served for the wrong table', async () => {
      const harness = createHarness()
      harness.fetchPage.mockImplementation(async () => page({ table: 'paints' }))

      const result = await harness.run()

      expect(result.status).toBe('failed')
      expect(result.error).toContain('table mismatch')
      expect(harness.onSucceeded).not.toHaveBeenCalled()
    })

    it('stops a server that never stops reporting more pages', async () => {
      const harness = createHarness()
      harness.fetchPage.mockImplementation(async (params) => page({
        table: params.table,
        rows: [row(params.table, 'x')],
        hasMore: true,
        next: { updated_at: CURSOR, id: 'x' },
      }))

      const result = await harness.run()

      expect(result.status).toBe('failed')
      expect(result.error).toContain(String(MAX_PAGES_PER_TABLE))
      expect(harness.onSucceeded).not.toHaveBeenCalled()
    })

    it('marks the run started even when it later fails', async () => {
      const harness = createHarness()
      harness.fetchPage.mockRejectedValue(new Error('offline'))

      await harness.run()

      expect(harness.onStarted).toHaveBeenCalledOnce()
      expect(harness.onFailed).toHaveBeenCalledOnce()
      expect(harness.onSucceeded).not.toHaveBeenCalled()
    })
  })

  it('is idempotent: replaying the same pages produces the same plans', async () => {
    const build = async () => {
      const harness = createHarness()
      harness.fetchPage.mockImplementation(async (params) =>
        page({ table: params.table, rows: [row(params.table, 'stable-id')] }))
      await harness.run()
      return harness.applyPlan.mock.calls.map(([plan]) => plan)
    }

    expect(await build()).toEqual(await build())
  })
})
