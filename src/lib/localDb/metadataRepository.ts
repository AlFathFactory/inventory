import { getLocalDb } from './connection'
import type { MetadataRow } from './models'

export async function getMetadataValue(key: string): Promise<string | null> {
  const db = await getLocalDb()
  const rows = await db.select<MetadataRow[]>(
    'SELECT key, value, updated_at FROM metadata WHERE key = $1',
    [key],
  )
  return rows[0]?.value ?? null
}

export async function setMetadataValue(key: string, value: string): Promise<void> {
  const db = await getLocalDb()
  await db.execute(
    `INSERT INTO metadata (key, value, updated_at) VALUES ($1, $2, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value],
  )
}
