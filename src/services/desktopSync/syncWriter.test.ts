import { describe, expect, it } from 'vitest'
import { buildSyncWritePlan } from './syncWriter'
import type { SyncSnapshot } from './syncPayload'
import { SYNC_TABLE_COLUMNS, SYNC_TABLE_NAMES, type SyncTableName } from './syncTables'

function emptySnapshot(): SyncSnapshot {
  const tables = Object.fromEntries(SYNC_TABLE_NAMES.map((table) => [table, []]))
  const rowCounts = Object.fromEntries(SYNC_TABLE_NAMES.map((table) => [table, 0]))
  return {
    nextCursor: '2026-09-07T10:00:00+00:00',
    tables: tables as SyncSnapshot['tables'],
    rowCounts: rowCounts as Record<SyncTableName, number>,
    deletedOperationIds: [],
  }
}

describe('buildSyncWritePlan', () => {
  it('produces an empty plan for an empty delta', () => {
    expect(buildSyncWritePlan(emptySnapshot())).toEqual({
      upserts: [],
      deletedOperationIds: [],
    })
  })

  it('includes only tables that actually have rows', () => {
    const snapshot = emptySnapshot()
    snapshot.tables.projects = [['p1', 'n', null, 'active', null, null, null]]

    const plan = buildSyncWritePlan(snapshot)

    expect(plan.upserts).toHaveLength(1)
    expect(plan.upserts[0].table).toBe('projects')
    expect(plan.upserts[0].columns).toEqual([...SYNC_TABLE_COLUMNS.projects])
    expect(plan.upserts[0].rows).toEqual([['p1', 'n', null, 'active', null, null, null]])
  })

  it('carries tombstone operation ids through untouched', () => {
    const snapshot = emptySnapshot()
    snapshot.deletedOperationIds = ['op-1', 'op-2']

    expect(buildSyncWritePlan(snapshot).deletedOperationIds).toEqual(['op-1', 'op-2'])
  })

  it('keeps every row aligned with its column list', () => {
    const snapshot = emptySnapshot()
    snapshot.tables.employees = [
      ['e1', 'اسم', 'E-1', 'dept', null, null, 1, null, null],
      ['e2', 'اسم2', null, null, null, null, 0, null, null],
    ]

    const [upsert] = buildSyncWritePlan(snapshot).upserts

    expect(upsert.columns).toHaveLength(SYNC_TABLE_COLUMNS.employees.length)
    for (const row of upsert.rows) {
      expect(row).toHaveLength(upsert.columns.length)
    }
  })

  it('is deterministic, so replaying a delta builds an identical plan', () => {
    const snapshot = emptySnapshot()
    snapshot.tables.projects = [['p1', 'n', null, 'active', null, null, null]]
    snapshot.deletedOperationIds = ['op-1']

    expect(buildSyncWritePlan(snapshot)).toEqual(buildSyncWritePlan(snapshot))
  })
})
