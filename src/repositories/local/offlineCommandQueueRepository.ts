import type Database from '@tauri-apps/plugin-sql'
import { getLocalDb } from '../../lib/localDb/connection'
import {
  deserializeOfflineCommand,
  serializeCanonicalPayload,
} from '../../lib/localDb/offlineCommandSerialization'
import type {
  EnqueueCommandInput,
  OfflineCommand,
  OfflineCommandRow,
  OfflineCommandStatus,
} from '../../lib/localDb/models/offlineCommand'
import { OFFLINE_COMMAND_TYPES } from '../../lib/localDb/models/offlineCommand'

const SELECT_COMMAND = `SELECT command_id, command_type, contract_version, payload_json,
  status, attempts, last_error, created_at, updated_at, synced_at
  FROM offline_commands`

export const SYNCED_COMMAND_RETENTION_DAYS = 7
export const SYNCED_COMMAND_CLEANUP_BATCH_SIZE = 100

type BindValue = string | number | null

export interface QueueDatabase {
  select<T>(query: string, bindValues?: BindValue[]): Promise<T>
  execute(query: string, bindValues?: BindValue[]): Promise<{ rowsAffected: number }>
}

export interface QueueRepositoryDependencies {
  getDatabase: () => Promise<QueueDatabase>
  createCommandId: () => string
  now: () => Date
}

export interface ListPendingCommandsOptions {
  limit?: number
  createdAtOrBefore?: string
}

export interface DeleteSyncedCommandsOptions {
  /** Defaults to seven days before `now`. */
  syncedAtOrBefore?: string
  /** Bounds each cleanup pass; defaults to 100. */
  limit?: number
}

export class DuplicateOfflineCommandError extends Error {
  constructor(commandId: string) {
    super(`Offline command ${commandId} already exists with different immutable data.`)
    this.name = 'DuplicateOfflineCommandError'
  }
}

export class OfflineCommandNotFoundError extends Error {
  constructor(commandId: string) {
    super(`Offline command ${commandId} was not found.`)
    this.name = 'OfflineCommandNotFoundError'
  }
}

export class OfflineCommandTransitionError extends Error {
  constructor(commandId: string, from: OfflineCommandStatus, to: OfflineCommandStatus) {
    super(`Offline command ${commandId} cannot transition from ${from} to ${to}.`)
    this.name = 'OfflineCommandTransitionError'
  }
}

function requireNonBlank(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-blank string.`)
  }
  return value
}

function requireCommandId(value: string): string {
  const commandId = requireNonBlank(value, 'commandId')
  if (commandId.length > 200) {
    throw new TypeError('commandId must not exceed 200 characters.')
  }
  return commandId
}

function requireCommandType(value: string) {
  if (!OFFLINE_COMMAND_TYPES.some((type) => type === value)) {
    throw new TypeError(`Unsupported offline command type: ${value}`)
  }
  return value
}

function requireContractVersion(value: number): 1 {
  if (value !== 1) {
    throw new TypeError('Unsupported offline command contract version.')
  }
  return 1
}

function requireLimit(value: number | undefined, fallback: number): number {
  const limit = value ?? fallback
  if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
    throw new TypeError('Queue query limit must be an integer from 1 to 1000.')
  }
  return limit
}

function errorText(error: string): string {
  return requireNonBlank(error, 'error')
}

export function createOfflineCommandQueueRepository(
  dependencies: QueueRepositoryDependencies,
) {
  async function getCommand(commandId: string): Promise<OfflineCommand | null> {
    const id = requireCommandId(commandId)
    const db = await dependencies.getDatabase()
    const rows = await db.select<OfflineCommandRow[]>(
      `${SELECT_COMMAND} WHERE command_id = $1 LIMIT 1`,
      [id],
    )
    return rows[0] ? deserializeOfflineCommand(rows[0]) : null
  }

  async function requireCommand(commandId: string): Promise<OfflineCommand> {
    const command = await getCommand(commandId)
    if (!command) throw new OfflineCommandNotFoundError(commandId)
    return command
  }

  async function enqueueCommand(input: EnqueueCommandInput): Promise<OfflineCommand> {
    const commandId = requireCommandId(input.commandId ?? dependencies.createCommandId())
    const commandType = requireCommandType(input.commandType)
    const contractVersion = requireContractVersion(input.contractVersion)
    const payloadJson = serializeCanonicalPayload(input.payload)
    const timestamp = dependencies.now().toISOString()
    const db = await dependencies.getDatabase()

    await db.execute(
      `INSERT INTO offline_commands (
        command_id, command_type, contract_version, payload_json, status, attempts,
        last_error, created_at, updated_at, synced_at
      ) VALUES ($1, $2, $3, $4, 'pending', 0, NULL, $5, $5, NULL)
      ON CONFLICT(command_id) DO NOTHING`,
      [commandId, commandType, contractVersion, payloadJson, timestamp],
    )

    const stored = await requireCommand(commandId)
    if (
      stored.commandType !== commandType
      || stored.contractVersion !== contractVersion
      || serializeCanonicalPayload(stored.payload) !== payloadJson
    ) {
      throw new DuplicateOfflineCommandError(commandId)
    }
    return stored
  }

  async function listPendingCommands(
    options: ListPendingCommandsOptions = {},
  ): Promise<OfflineCommand[]> {
    const limit = requireLimit(options.limit, 100)
    const db = await dependencies.getDatabase()
    const rows = options.createdAtOrBefore
      ? await db.select<OfflineCommandRow[]>(
          `${SELECT_COMMAND}
           WHERE status = 'pending' AND created_at <= $1
           ORDER BY created_at ASC, command_id ASC LIMIT $2`,
          [options.createdAtOrBefore, limit],
        )
      : await db.select<OfflineCommandRow[]>(
          `${SELECT_COMMAND}
           WHERE status = 'pending'
           ORDER BY created_at ASC, command_id ASC LIMIT $1`,
          [limit],
        )
    return rows.map(deserializeOfflineCommand)
  }

  async function transition(
    commandId: string,
    from: OfflineCommandStatus,
    to: OfflineCommandStatus,
    updates: string,
    values: BindValue[],
  ): Promise<OfflineCommand> {
    const id = requireCommandId(commandId)
    const db = await dependencies.getDatabase()
    const result = await db.execute(
      `UPDATE offline_commands SET status = $1, ${updates}
       WHERE command_id = $2 AND status = $3`,
      [to, id, from, ...values],
    )
    if (result.rowsAffected === 0) {
      const current = await requireCommand(id)
      throw new OfflineCommandTransitionError(id, current.status, to)
    }
    return requireCommand(id)
  }

  function markSyncing(commandId: string): Promise<OfflineCommand> {
    return transition(
      commandId,
      'pending',
      'syncing',
      `attempts = attempts + 1, last_error = NULL, updated_at = $4`,
      [dependencies.now().toISOString()],
    )
  }

  function markSynced(commandId: string): Promise<OfflineCommand> {
    const timestamp = dependencies.now().toISOString()
    return transition(
      commandId,
      'syncing',
      'synced',
      `last_error = NULL, updated_at = $4, synced_at = $4`,
      [timestamp],
    )
  }

  function markFailed(commandId: string, error: string): Promise<OfflineCommand> {
    return transition(
      commandId,
      'syncing',
      'failed',
      `last_error = $4, updated_at = $5, synced_at = NULL`,
      [errorText(error), dependencies.now().toISOString()],
    )
  }

  function markConflict(commandId: string, error: string): Promise<OfflineCommand> {
    return transition(
      commandId,
      'syncing',
      'conflict',
      `last_error = $4, updated_at = $5, synced_at = NULL`,
      [errorText(error), dependencies.now().toISOString()],
    )
  }

  /** Only failed commands are retryable; conflicts require explicit resolution. */
  function retryCommand(commandId: string): Promise<OfflineCommand> {
    return transition(
      commandId,
      'failed',
      'pending',
      `last_error = NULL, updated_at = $4, synced_at = NULL`,
      [dependencies.now().toISOString()],
    )
  }

  async function deleteSyncedCommands(
    options: DeleteSyncedCommandsOptions = {},
  ): Promise<number> {
    const limit = requireLimit(options.limit, SYNCED_COMMAND_CLEANUP_BATCH_SIZE)
    const cutoff = options.syncedAtOrBefore ?? new Date(
      dependencies.now().getTime() - SYNCED_COMMAND_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
    const db = await dependencies.getDatabase()
    const result = await db.execute(
      `DELETE FROM offline_commands
       WHERE command_id IN (
         SELECT command_id FROM offline_commands
         WHERE status = 'synced' AND synced_at <= $1
         ORDER BY synced_at ASC, command_id ASC LIMIT $2
       )`,
      [cutoff, limit],
    )
    return result.rowsAffected
  }

  /**
   * A process can close after the server commits but before `markSynced`.
   * Requeue only those interrupted in-flight rows; the backend receipt makes
   * replaying their unchanged command IDs idempotent.
   */
  async function recoverInterruptedCommands(): Promise<number> {
    const db = await dependencies.getDatabase()
    const result = await db.execute(
      `UPDATE offline_commands
       SET status = 'pending', updated_at = $1
       WHERE status = 'syncing'`,
      [dependencies.now().toISOString()],
    )
    return result.rowsAffected
  }

  return {
    enqueueCommand,
    getCommand,
    listPendingCommands,
    markSyncing,
    markSynced,
    markFailed,
    markConflict,
    retryCommand,
    deleteSyncedCommands,
    recoverInterruptedCommands,
  }
}

const desktopQueue = createOfflineCommandQueueRepository({
  getDatabase: () => getLocalDb() as Promise<Database & QueueDatabase>,
  createCommandId: () => crypto.randomUUID(),
  now: () => new Date(),
})

export const localOfflineCommandQueueRepository = desktopQueue

export const enqueueCommand = desktopQueue.enqueueCommand
export const getCommand = desktopQueue.getCommand
export const listPendingCommands = desktopQueue.listPendingCommands
export const markSyncing = desktopQueue.markSyncing
export const markSynced = desktopQueue.markSynced
export const markFailed = desktopQueue.markFailed
export const markConflict = desktopQueue.markConflict
export const retryCommand = desktopQueue.retryCommand
export const deleteSyncedCommands = desktopQueue.deleteSyncedCommands
export const recoverInterruptedCommands = desktopQueue.recoverInterruptedCommands
