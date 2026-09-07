import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from '@tauri-apps/plugin-sql'
import { applySyncSnapshot } from './syncWriter'
import type { SyncSnapshot } from './syncPayload'
import { SYNC_TABLE_NAMES, type SyncTableName } from './syncTables'

const executeMock = vi.fn()
const db = { execute: executeMock } as unknown as Database

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

function statements() {
  return executeMock.mock.calls.map(([sql]) => sql as string)
}

describe('applySyncSnapshot', () => {
  beforeEach(() => {
    executeMock.mockReset()
    executeMock.mockResolvedValue({ rowsAffected: 1 })
  })

  it('writes nothing when every table is empty', async () => {
    await applySyncSnapshot(db, emptySnapshot())

    expect(executeMock).not.toHaveBeenCalled()
  })

  it('upserts rows idempotently with ON CONFLICT', async () => {
    const snapshot = emptySnapshot()
    snapshot.tables.projects = [
      ['p1', 'أ', null, 'active', null, '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00'],
    ]

    await applySyncSnapshot(db, snapshot)

    const [sql, bindings] = executeMock.mock.calls[0]
    expect(sql).toContain('INSERT INTO projects (id, name, code, status, notes, created_at, updated_at)')
    expect(sql).toContain('ON CONFLICT(id) DO UPDATE SET')
    expect(sql).toContain('name = excluded.name')
    expect(sql).not.toContain('id = excluded.id,')
    expect(bindings).toHaveLength(7)
    expect(bindings[0]).toBe('p1')
  })

  it('batches multiple rows into a single statement', async () => {
    const snapshot = emptySnapshot()
    snapshot.tables.projects = Array.from({ length: 3 }, (_, index) => [
      `p${index}`, 'n', null, 'active', null, null, null,
    ])

    await applySyncSnapshot(db, snapshot)

    expect(executeMock).toHaveBeenCalledTimes(1)
    const [sql, bindings] = executeMock.mock.calls[0]
    expect(sql).toContain('($1, $2, $3, $4, $5, $6, $7), ($8,')
    expect(bindings).toHaveLength(21)
  })

  it('splits oversized batches to stay under the bind-parameter limit', async () => {
    const snapshot = emptySnapshot()
    // projects maps 7 columns => 128 rows per chunk (900 / 7).
    snapshot.tables.projects = Array.from({ length: 200 }, (_, index) => [
      `p${index}`, 'n', null, 'active', null, null, null,
    ])

    await applySyncSnapshot(db, snapshot)

    expect(executeMock).toHaveBeenCalledTimes(2)
    expect(executeMock.mock.calls[0][1]).toHaveLength(128 * 7)
    expect(executeMock.mock.calls[1][1]).toHaveLength(72 * 7)
  })

  it('applies tombstones by operation_id after the upserts', async () => {
    const snapshot = emptySnapshot()
    snapshot.tables.projects = [['p1', 'n', null, 'active', null, null, null]]
    snapshot.deletedOperationIds = ['op-1', 'op-2']

    await applySyncSnapshot(db, snapshot)

    const sql = statements()
    expect(sql[0]).toContain('INSERT INTO projects')
    expect(sql.at(-1)).toBe('DELETE FROM inventory_operations WHERE id IN ($1, $2)')
    expect(executeMock.mock.calls.at(-1)?.[1]).toEqual(['op-1', 'op-2'])
  })

  it('never deletes from any table other than inventory_operations', async () => {
    const snapshot = emptySnapshot()
    snapshot.deletedOperationIds = ['op-1']

    await applySyncSnapshot(db, snapshot)

    const deletes = statements().filter((sql) => sql.startsWith('DELETE'))
    expect(deletes).toEqual(['DELETE FROM inventory_operations WHERE id IN ($1)'])
  })
})
