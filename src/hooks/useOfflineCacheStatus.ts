import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { offlineDb, type OfflineCacheMetadata } from '../lib/offlineDb'

type CacheSnapshot = {
  metadata: OfflineCacheMetadata | null
  itemCount: number
  projectCount: number
  employeeCount: number
  supplierCount: number
}

const initialSnapshot: CacheSnapshot = {
  metadata: null,
  itemCount: 0,
  projectCount: 0,
  employeeCount: 0,
  supplierCount: 0,
}

export function useOfflineCacheStatus() {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [metadata, itemCount, projectCount, employeeCount, supplierCount] = await Promise.all([
        offlineDb.offline_cache_metadata.get('bootstrap'),
        offlineDb.cached_inventory_items.count(),
        offlineDb.cached_projects.count(),
        offlineDb.cached_parties.where('kind').equals('employee').count(),
        offlineDb.cached_parties.where('kind').equals('supplier').count(),
      ])
      return { metadata: metadata ?? null, itemCount, projectCount, employeeCount, supplierCount }
    }).subscribe(setSnapshot)
    return () => subscription.unsubscribe()
  }, [])
  return snapshot
}
