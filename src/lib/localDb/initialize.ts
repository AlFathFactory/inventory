import { isDesktopRuntime } from '../../config/platform'
import { getLocalDb } from './connection'
import { METADATA_KEYS } from './metadataKeys'
import { setMetadataValue } from './metadataRepository'

const SCHEMA_VERSION = '5'

/**
 * Opens the desktop local database once at app startup, applying any
 * pending migrations. A no-op on web, so callers don't need their own
 * platform branch — this is the one safe entry point for triggering
 * initialization from shared app bootstrap code.
 */
export async function initializeLocalDb(): Promise<void> {
  if (!isDesktopRuntime()) {
    return
  }
  await getLocalDb()
  await setMetadataValue(METADATA_KEYS.schemaVersion, SCHEMA_VERSION)
}
