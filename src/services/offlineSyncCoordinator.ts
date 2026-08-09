import { syncOfflineData } from './syncService'

let activeSyncPromise: Promise<void> | null = null

async function executeSync() {
  await syncOfflineData()
}

export function runOfflineSyncOnce(): Promise<void> {
  if (activeSyncPromise) return activeSyncPromise
  const run = async () => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (locks) await locks.request('inventory-offline-sync', executeSync)
    else await executeSync()
  }
  activeSyncPromise = run().finally(() => { activeSyncPromise = null })
  return activeSyncPromise
}
