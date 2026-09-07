import type { SyncBindValue } from '../../lib/localDb/transaction'
import { SYNC_TABLE_COLUMNS, SYNC_TABLE_NAMES, type SyncTableName } from './syncTables'

/** Payload contract version returned by `get_inventory_sync_delta_rpc`. */
export const SUPPORTED_SYNC_PAYLOAD_VERSION = 3

export type { SyncBindValue } from '../../lib/localDb/transaction'

export interface SyncSnapshot {
  nextCursor: string
  /** Rows per table, already reduced to the mapped columns, in bind order. */
  tables: Record<SyncTableName, SyncBindValue[][]>
  /** `operation_id` values whose `inventory_operations` rows must be removed. */
  deletedOperationIds: string[]
  rowCounts: Record<SyncTableName, number>
}

export class SyncPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SyncPayloadError'
  }
}

export class SyncSchemaVersionError extends SyncPayloadError {
  readonly received: unknown

  constructor(received: unknown) {
    super(
      `Unsupported sync payload schema_version: expected ${SUPPORTED_SYNC_PAYLOAD_VERSION}, received ${String(received)}`,
    )
    this.name = 'SyncSchemaVersionError'
    this.received = received
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Converts one JSON value into something SQLite can bind. Timestamps and
 * UUIDs are strings and are passed through untouched; booleans become 0/1
 * to match the INTEGER columns used by the local schema.
 */
export function toBindValue(value: unknown): SyncBindValue {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }
  return JSON.stringify(value)
}

/**
 * Validates the RPC response and reduces it to exactly the rows/columns the
 * local schema stores. Throws `SyncPayloadError` for anything unexpected so
 * a malformed response can never reach the database.
 */
export function parseSyncPayload(payload: unknown): SyncSnapshot {
  if (!isRecord(payload)) {
    throw new SyncPayloadError('Sync payload must be an object')
  }

  if (payload.schema_version !== SUPPORTED_SYNC_PAYLOAD_VERSION) {
    throw new SyncSchemaVersionError(payload.schema_version)
  }

  const nextCursor = payload.next_cursor
  if (typeof nextCursor !== 'string' || nextCursor.length === 0) {
    throw new SyncPayloadError('Sync payload is missing a next_cursor string')
  }

  const tables = payload.tables
  if (!isRecord(tables)) {
    throw new SyncPayloadError('Sync payload is missing a tables object')
  }

  const parsedTables = {} as Record<SyncTableName, SyncBindValue[][]>
  const rowCounts = {} as Record<SyncTableName, number>
  const deletedOperationIds: string[] = []

  for (const table of SYNC_TABLE_NAMES) {
    const rows = tables[table]
    if (!Array.isArray(rows)) {
      throw new SyncPayloadError(`Sync payload table "${table}" must be an array`)
    }

    const columns = SYNC_TABLE_COLUMNS[table] as readonly string[]
    parsedTables[table] = rows.map((row, index) => {
      if (!isRecord(row)) {
        throw new SyncPayloadError(`Sync payload row ${index} of "${table}" must be an object`)
      }
      if (typeof row.id !== 'string' || row.id.length === 0) {
        throw new SyncPayloadError(`Sync payload row ${index} of "${table}" is missing a string id`)
      }
      if (table === 'inventory_operation_deletions') {
        if (typeof row.operation_id !== 'string' || row.operation_id.length === 0) {
          throw new SyncPayloadError(
            `Tombstone row ${index} is missing a string operation_id`,
          )
        }
        deletedOperationIds.push(row.operation_id)
      }
      return columns.map((column) => toBindValue(row[column]))
    })
    rowCounts[table] = parsedTables[table].length
  }

  return { nextCursor, tables: parsedTables, deletedOperationIds, rowCounts }
}
