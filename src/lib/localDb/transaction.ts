import type Database from '@tauri-apps/plugin-sql'
import { getLocalDb } from './connection'

/**
 * Serializes transactions in this process. The SQL plugin runs statements
 * against a connection pool, so `BEGIN`/`COMMIT` are only guaranteed to
 * share a connection while no other query is in flight. Queueing here keeps
 * the local database single-writer, and `BEGIN IMMEDIATE` makes any lock
 * contention fail fast instead of committing a partial write.
 */
let queue: Promise<unknown> = Promise.resolve()

async function runExclusive<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run, run)
  queue = result.catch(() => undefined)
  return result
}

/**
 * Runs `work` inside one SQLite transaction: commits when it resolves,
 * rolls back when it rejects. The original error is always propagated,
 * even if the rollback itself fails.
 */
export async function withTransaction<T>(
  work: (db: Database) => Promise<T>,
): Promise<T> {
  return runExclusive(async () => {
    const db = await getLocalDb()
    await db.execute('BEGIN IMMEDIATE')
    let result: T
    try {
      result = await work(db)
    } catch (error) {
      try {
        await db.execute('ROLLBACK')
      } catch {
        // Surface the failure that actually caused the rollback.
      }
      throw error
    }
    await db.execute('COMMIT')
    return result
  })
}
