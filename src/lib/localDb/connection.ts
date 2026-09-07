import type Database from '@tauri-apps/plugin-sql'
import { isDesktopRuntime } from '../../config/platform'

/**
 * Must match the connection string registered with `add_migrations` in
 * `src-tauri/src/db.rs` — that's what ties this path to the desktop app's
 * migrations. Resolved by the SQL plugin against the OS app-data directory,
 * so no absolute path ever appears here.
 */
const DATABASE_URL = 'sqlite:inventory.db'

let connection: Database | null = null
let connecting: Promise<Database> | null = null

/**
 * Lazily opens the desktop local SQLite database, running any pending
 * migrations on first connect. Throws outside the Tauri desktop runtime so
 * web code can never accidentally pull in or initialize a local database.
 */
export async function getLocalDb(): Promise<Database> {
  if (!isDesktopRuntime()) {
    throw new Error('Local SQLite database is only available in the desktop runtime.')
  }
  if (connection) {
    return connection
  }
  if (!connecting) {
    connecting = import('@tauri-apps/plugin-sql').then(async (sqlPlugin) => {
      const db = await sqlPlugin.default.load(DATABASE_URL)
      connection = db
      return db
    })
  }
  return connecting
}
