import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createOfflineCommandQueueRepository,
  DuplicateOfflineCommandError,
  OfflineCommandTransitionError,
  type QueueDatabase,
} from './offlineCommandQueueRepository'

function migrationSql(name: string) {
  return readFileSync(
    fileURLToPath(new URL(`../../../src-tauri/src/db/migrations/${name}.sql`, import.meta.url)),
    'utf8',
  )
}

function expandBindings(sql: string, bindings: Array<string | number | null> = []) {
  const expanded: Array<string | number | null> = []
  const query = sql.replace(/\$(\d+)/g, (_match, index: string) => {
    expanded.push(bindings[Number(index) - 1])
    return '?'
  })
  return { query, expanded }
}

function adapt(db: DatabaseSync): QueueDatabase {
  return {
    async select<T>(sql, bindings) {
      const { query, expanded } = expandBindings(sql, bindings)
      return db.prepare(query).all(...expanded) as T
    },
    async execute(sql, bindings) {
      const { query, expanded } = expandBindings(sql, bindings)
      const result = db.prepare(query).run(...expanded)
      return { rowsAffected: Number(result.changes) }
    },
  }
}

const BASE_TIME = Date.parse('2026-09-07T10:00:00.000Z')
const DEFAULT_COMMAND = {
  commandType: 'inventory_operation',
  contractVersion: 1,
  payload: {
    quantity: 3,
    item_id: 'item-1',
    metadata: { z: true, a: null },
  },
} as const

let db: DatabaseSync
let currentTime: number
let idCounter: number

function repository(database = db) {
  return createOfflineCommandQueueRepository({
    getDatabase: async () => adapt(database),
    createCommandId: () => `command-${++idCounter}`,
    now: () => new Date(currentTime),
  })
}

function advance(milliseconds = 1_000) {
  currentTime += milliseconds
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec(migrationSql('v4_offline_command_queue'))
  db.exec(migrationSql('v5_interrupted_command_recovery'))
  currentTime = BASE_TIME
  idCounter = 0
})

afterEach(() => {
  db.close()
})

describe('desktop offline command queue', () => {
  it('enqueues and reads the backend envelope with canonical JSON', async () => {
    const queue = repository()
    const queued = await queue.enqueueCommand(DEFAULT_COMMAND)

    expect(queued).toMatchObject({
      commandId: 'command-1',
      commandType: DEFAULT_COMMAND.commandType,
      contractVersion: 1,
      payload: DEFAULT_COMMAND.payload,
      status: 'pending',
      attempts: 0,
      lastError: null,
      syncedAt: null,
    })
    expect(await queue.getCommand('command-1')).toEqual(queued)
    expect(db.prepare('SELECT payload_json FROM offline_commands').get()).toEqual({
      payload_json: '{"item_id":"item-1","metadata":{"a":null,"z":true},"quantity":3}',
    })
  })

  it('treats an identical command id and envelope as an idempotent enqueue', async () => {
    const queue = repository()
    const first = await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'stable-id' })
    advance()
    const duplicate = await queue.enqueueCommand({
      ...DEFAULT_COMMAND,
      commandId: 'stable-id',
      payload: { metadata: { a: null, z: true }, item_id: 'item-1', quantity: 3 },
    })

    expect(duplicate).toEqual(first)
    expect(db.prepare('SELECT count(*) AS count FROM offline_commands').get()).toEqual({ count: 1 })
  })

  it('rejects reuse of a command id with a changed payload', async () => {
    const queue = repository()
    await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'stable-id' })

    await expect(queue.enqueueCommand({
      ...DEFAULT_COMMAND,
      commandId: 'stable-id',
      payload: { ...DEFAULT_COMMAND.payload, quantity: 4 },
    })).rejects.toBeInstanceOf(DuplicateOfflineCommandError)
    expect((await queue.getCommand('stable-id'))?.payload.quantity).toBe(3)
  })

  it('rejects values outside backend contract version 1 before writing', async () => {
    const queue = repository()

    await expect(queue.enqueueCommand({
      ...DEFAULT_COMMAND,
      commandType: 'unknown' as typeof DEFAULT_COMMAND.commandType,
    })).rejects.toThrow(/unsupported offline command type/i)
    await expect(queue.enqueueCommand({
      ...DEFAULT_COMMAND,
      contractVersion: 2 as 1,
    })).rejects.toThrow(/contract version/i)
    expect(db.prepare('SELECT count(*) AS count FROM offline_commands').get()).toEqual({ count: 0 })
  })

  it('lists pending commands oldest first and respects its indexed limit', async () => {
    const queue = repository()
    await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'b' })
    advance()
    await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'a' })
    advance()
    await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'c' })
    await queue.markSyncing('a')

    expect((await queue.listPendingCommands({ limit: 1 })).map((command) => command.commandId))
      .toEqual(['b'])
    const queryPlan = db.prepare(`EXPLAIN QUERY PLAN
      SELECT command_id FROM offline_commands
      WHERE status = 'pending' ORDER BY created_at, command_id LIMIT 10`).all()
    expect(JSON.stringify(queryPlan)).toContain('offline_commands_status_created_at_idx')
  })

  it('enforces status transitions and records attempts, errors, and sync time', async () => {
    const queue = repository()
    await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'success' })
    const syncing = await queue.markSyncing('success')
    expect(syncing).toMatchObject({ status: 'syncing', attempts: 1 })
    advance()
    const synced = await queue.markSynced('success')
    expect(synced).toMatchObject({
      status: 'synced',
      attempts: 1,
      syncedAt: new Date(currentTime).toISOString(),
    })
    await expect(queue.markSyncing('success')).rejects.toBeInstanceOf(OfflineCommandTransitionError)

    await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'failed' })
    await queue.markSyncing('failed')
    expect(await queue.markFailed('failed', 'network unavailable')).toMatchObject({
      status: 'failed',
      lastError: 'network unavailable',
      syncedAt: null,
    })

    await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'conflict' })
    await queue.markSyncing('conflict')
    expect(await queue.markConflict('conflict', 'stale version')).toMatchObject({
      status: 'conflict',
      lastError: 'stale version',
    })
    await expect(queue.retryCommand('conflict')).rejects.toBeInstanceOf(OfflineCommandTransitionError)
  })

  it('retries failed commands without changing immutable contract fields', async () => {
    const queue = repository()
    const original = await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'retry-id' })
    await queue.markSyncing('retry-id')
    await queue.markFailed('retry-id', 'temporary error')
    advance()
    const retried = await queue.retryCommand('retry-id')

    expect(retried).toMatchObject({ status: 'pending', attempts: 1, lastError: null })
    expect({
      commandId: retried.commandId,
      commandType: retried.commandType,
      contractVersion: retried.contractVersion,
      payload: retried.payload,
      createdAt: retried.createdAt,
    }).toEqual({
      commandId: original.commandId,
      commandType: original.commandType,
      contractVersion: original.contractVersion,
      payload: original.payload,
      createdAt: original.createdAt,
    })
    expect((await queue.markSyncing('retry-id')).attempts).toBe(2)
  })

  it('also rejects immutable-field changes issued outside the repository', async () => {
    const queue = repository()
    await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'guarded' })

    expect(() => db.exec("UPDATE offline_commands SET payload_json = '{\"quantity\":99}' WHERE command_id = 'guarded'"))
      .toThrow(/immutable/i)
  })

  it('atomically recovers interrupted syncing commands without changing their envelope', async () => {
    const queue = repository()
    const original = await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'interrupted' })
    await queue.markSyncing('interrupted')

    expect(await queue.recoverInterruptedCommands()).toBe(1)
    expect(await queue.getCommand('interrupted')).toMatchObject({
      commandId: original.commandId,
      commandType: original.commandType,
      contractVersion: original.contractVersion,
      payload: original.payload,
      status: 'pending',
      attempts: 1,
    })
  })

  it('cleanup removes only eligible synced commands', async () => {
    const queue = repository()
    for (const commandId of ['synced-old', 'synced-new', 'pending', 'failed', 'conflict']) {
      await queue.enqueueCommand({ ...DEFAULT_COMMAND, commandId })
    }
    await queue.markSyncing('synced-old')
    await queue.markSynced('synced-old')
    advance(10_000)
    await queue.markSyncing('synced-new')
    await queue.markSynced('synced-new')
    await queue.markSyncing('failed')
    await queue.markFailed('failed', 'keep me')
    await queue.markSyncing('conflict')
    await queue.markConflict('conflict', 'keep me too')

    const removed = await queue.deleteSyncedCommands({
      syncedAtOrBefore: new Date(BASE_TIME + 5_000).toISOString(),
    })

    expect(removed).toBe(1)
    expect(await queue.getCommand('synced-old')).toBeNull()
    for (const commandId of ['synced-new', 'pending', 'failed', 'conflict']) {
      expect(await queue.getCommand(commandId)).not.toBeNull()
    }
  })
})

describe('queue persistence and schema upgrade', () => {
  it('preserves queue state after the SQLite file is closed and reopened', async () => {
    db.close()
    const directory = mkdtempSync(join(tmpdir(), 'inventory-command-queue-'))
    const databasePath = join(directory, 'inventory.db')
    try {
      let fileDb = new DatabaseSync(databasePath)
      fileDb.exec(migrationSql('v4_offline_command_queue'))
      fileDb.exec(migrationSql('v5_interrupted_command_recovery'))
      const firstQueue = repository(fileDb)
      await firstQueue.enqueueCommand({ ...DEFAULT_COMMAND, commandId: 'persisted' })
      await firstQueue.markSyncing('persisted')
      await firstQueue.markFailed('persisted', 'persisted failure')
      fileDb.close()

      fileDb = new DatabaseSync(databasePath)
      const reopenedQueue = repository(fileDb)
      expect(await reopenedQueue.getCommand('persisted')).toMatchObject({
        commandId: 'persisted',
        status: 'failed',
        attempts: 1,
        lastError: 'persisted failure',
        payload: DEFAULT_COMMAND.payload,
      })
      fileDb.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
      db = new DatabaseSync(':memory:')
    }
  })

  it('upgrades a populated v3 database without changing existing data', () => {
    db.close()
    db = new DatabaseSync(':memory:')
    for (const migration of [
      'v1_metadata',
      'v2_categories',
      'v2_stock_items',
      'v2_parties',
      'v2_operations',
      'v2_custody',
      'v3_custody_categories',
    ]) db.exec(migrationSql(migration))
    db.exec(`
      INSERT INTO metadata (key, value, updated_at)
      VALUES ('upgrade_marker', 'preserve-me', '2026-09-01T00:00:00.000Z');
      INSERT INTO consumables (id, item_name, stock_balance)
      VALUES ('existing-item', 'Existing', 42);
    `)

    db.exec(migrationSql('v4_offline_command_queue'))
    db.exec(migrationSql('v5_interrupted_command_recovery'))

    expect(db.prepare("SELECT value FROM metadata WHERE key = 'upgrade_marker'").get())
      .toEqual({ value: 'preserve-me' })
    expect(db.prepare("SELECT item_name, stock_balance FROM consumables WHERE id = 'existing-item'").get())
      .toEqual({ item_name: 'Existing', stock_balance: 42 })
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'offline_commands'").get())
      .toEqual({ name: 'offline_commands' })
  })
})
