import type { SyncBindValue } from '../../lib/localDb/transaction'
import { SyncPayloadError } from './syncPayload'
import { toBindValue } from './syncPayload'
import { SYNC_TABLE_COLUMNS, type SyncTableName } from './syncTables'
import type { SnapshotPageCursor } from './snapshotClient'

/** Contract version returned by `get_inventory_snapshot_page_rpc`. */
export const SUPPORTED_SNAPSHOT_PAGE_VERSION = 1

export class SnapshotPageError extends SyncPayloadError {
  constructor(message: string) {
    super(message)
    this.name = 'SnapshotPageError'
  }
}

export class SnapshotVersionError extends SnapshotPageError {
  readonly received: unknown

  constructor(received: unknown) {
    super(
      `Unsupported snapshot page schema_version: expected ${SUPPORTED_SNAPSHOT_PAGE_VERSION}, received ${String(received)}`,
    )
    this.name = 'SnapshotVersionError'
    this.received = received
  }
}

export interface SnapshotPage {
  table: SyncTableName
  /** The point in time the whole snapshot is read at. */
  snapshotCursor: string
  /** Rows reduced to the mapped columns, in bind order. */
  rows: SyncBindValue[][]
  /** `operation_id` values, only ever populated for the tombstone table. */
  deletedOperationIds: string[]
  hasMore: boolean
  nextPageCursor: SnapshotPageCursor | null
  rowCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireCursor(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SnapshotPageError(`Snapshot page is missing a ${label} string`)
  }
  return value
}

function parseNextPageCursor(value: unknown): SnapshotPageCursor | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) {
    throw new SnapshotPageError('Snapshot page next_page_cursor must be an object')
  }
  return {
    updated_at: requireCursor(value.updated_at, 'next_page_cursor.updated_at'),
    id: requireCursor(value.id, 'next_page_cursor.id'),
  }
}

/**
 * Validates one snapshot page and reduces it to exactly the rows/columns the
 * local schema stores, so a malformed response can never reach the database.
 *
 * `expectedTable` is checked against the echoed table name: a page applied to
 * the wrong table would silently corrupt the local projection.
 */
export function parseSnapshotPage(
  payload: unknown,
  expectedTable: SyncTableName,
): SnapshotPage {
  if (!isRecord(payload)) {
    throw new SnapshotPageError('Snapshot page must be an object')
  }

  if (payload.schema_version !== SUPPORTED_SNAPSHOT_PAGE_VERSION) {
    throw new SnapshotVersionError(payload.schema_version)
  }

  if (payload.table !== expectedTable) {
    throw new SnapshotPageError(
      `Snapshot page table mismatch: requested "${expectedTable}", received "${String(payload.table)}"`,
    )
  }

  const snapshotCursor = requireCursor(payload.snapshot_cursor, 'snapshot_cursor')

  const rawRows = payload.rows
  if (!Array.isArray(rawRows)) {
    throw new SnapshotPageError(`Snapshot page rows for "${expectedTable}" must be an array`)
  }

  const columns = SYNC_TABLE_COLUMNS[expectedTable] as readonly string[]
  const deletedOperationIds: string[] = []

  const rows = rawRows.map((row, index) => {
    if (!isRecord(row)) {
      throw new SnapshotPageError(
        `Snapshot row ${index} of "${expectedTable}" must be an object`,
      )
    }
    if (typeof row.id !== 'string' || row.id.length === 0) {
      throw new SnapshotPageError(
        `Snapshot row ${index} of "${expectedTable}" is missing a string id`,
      )
    }
    if (expectedTable === 'inventory_operation_deletions') {
      if (typeof row.operation_id !== 'string' || row.operation_id.length === 0) {
        throw new SnapshotPageError(`Tombstone row ${index} is missing a string operation_id`)
      }
      deletedOperationIds.push(row.operation_id)
    }
    return columns.map((column) => toBindValue(row[column]))
  })

  const hasMore = payload.has_more === true
  const nextPageCursor = parseNextPageCursor(payload.next_page_cursor)

  if (hasMore && nextPageCursor === null) {
    throw new SnapshotPageError(
      `Snapshot page for "${expectedTable}" reports more rows but no next_page_cursor`,
    )
  }

  return {
    table: expectedTable,
    snapshotCursor,
    rows,
    deletedOperationIds,
    hasMore,
    nextPageCursor,
    rowCount: rows.length,
  }
}
