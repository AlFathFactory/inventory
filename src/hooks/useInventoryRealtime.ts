import { useEffect } from 'react'
import { inventoryKeys } from '../features/inventory/inventoryQueryKeys'
import { projectKeys } from '../features/projects/projectQueries'
import { queryClient } from '../lib/queryClient'
import {
  createTrailingInvalidation,
  subscribeToInventoryChanges,
  type InventoryRealtimeEvent,
} from '../services/inventoryRealtimeService'

function eventKey(event: InventoryRealtimeEvent) {
  return event.kind === 'inventory' ? `inventory:${event.tableName}` : event.kind
}

export function useInventoryRealtime() {
  useEffect(() => {
    const scheduler = createTrailingInvalidation((eventKeys) => {
      const dashboardUpdatedAt = queryClient.getQueryState(inventoryKeys.dashboard())?.dataUpdatedAt ?? 0
      if (Date.now() - dashboardUpdatedAt >= 2_000) {
        void queryClient.invalidateQueries({ queryKey: inventoryKeys.dashboard() })
      }
      for (const key of eventKeys) {
        if (key.startsWith('inventory:')) {
          const tableName = key.slice('inventory:'.length)
          void queryClient.invalidateQueries({ queryKey: inventoryKeys.category(tableName) })
          void queryClient.invalidateQueries({ queryKey: inventoryKeys.alerts() })
        } else if (key === 'projects') {
          void queryClient.invalidateQueries({ queryKey: projectKeys.all })
        }
      }
    })
    const unsubscribe = subscribeToInventoryChanges((event) => scheduler.queue(eventKey(event)))
    return () => {
      scheduler.dispose()
      unsubscribe()
    }
  }, [])
}
