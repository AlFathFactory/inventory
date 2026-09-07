import { getLocalDb } from './connection'
import type { MetadataRow } from './models'

/**
 * Reads several keys in one query so callers get a consistent snapshot
 * instead of a set of independently-timed reads.
 */
export async function getMetadataValues(keys: string[]): Promise<Map<string, string>> {
  if (keys.length === 0) {
    return new Map()
  }
  const db = await getLocalDb()
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ')
  const rows = await db.select<MetadataRow[]>(
    `SELECT key, value, updated_at FROM metadata WHERE key IN (${placeholders})`,
    keys,
  )
  return new Map(rows.map((row) => [row.key, row.value]))
}

export async function getMetadataValue(key: string): Promise<string | null> {
  const values = await getMetadataValues([key])
  return values.get(key) ?? null
}

/**
 * Upserts every entry in a single statement, so a group of related values
 * (such as one sync transition) is written atomically.
 */
export async function setMetadataValues(entries: Record<string, string>): Promise<void> {
  const entryList = Object.entries(entries)
  if (entryList.length === 0) {
    return
  }
  const db = await getLocalDb()
  const rowPlaceholders = entryList
    .map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2}, datetime('now'))`)
    .join(', ')
  await db.execute(
    `INSERT INTO metadata (key, value, updated_at) VALUES ${rowPlaceholders}
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    entryList.flat(),
  )
}

export async function setMetadataValue(key: string, value: string): Promise<void> {
  await setMetadataValues({ [key]: value })
}

export async function deleteMetadataValues(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return
  }
  const db = await getLocalDb()
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ')
  await db.execute(`DELETE FROM metadata WHERE key IN (${placeholders})`, keys)
}
