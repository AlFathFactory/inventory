import { useEffect } from 'react'
import type { QueryKey } from '@tanstack/react-query'
import { dynamicCategoryKeys } from '../features/dynamic-categories/dynamicCategoryQueries'
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

export function getInvalidationTargetsForEventKey(key: string): readonly QueryKey[] {
  if (key.startsWith('inventory:')) {
    const tableName = key.slice('inventory:'.length)
    return [inventoryKeys.category(tableName), inventoryKeys.alerts()]
  }
  if (key === 'dynamic-inventory') {
    return [
      inventoryKeys.alerts(),
      dynamicCategoryKeys.all,
      dynamicCategoryKeys.detailRoot,
      dynamicCategoryKeys.itemsListRoot,
      dynamicCategoryKeys.itemRoot,
      dynamicCategoryKeys.movementsRoot,
    ]
  }
  if (key === 'projects') {
    return [projectKeys.all]
  }
  return []
}

export function useInventoryRealtime() {
  useEffect(() => {
    const scheduler = createTrailingInvalidation((eventKeys) => {
      const dashboardUpdatedAt = queryClient.getQueryState(inventoryKeys.dashboard())?.dataUpdatedAt ?? 0
      if (Date.now() - dashboardUpdatedAt >= 2_000) {
        void queryClient.invalidateQueries({ queryKey: inventoryKeys.dashboard() })
      }
      for (const key of eventKeys) {
        for (const queryKey of getInvalidationTargetsForEventKey(key)) {
          void queryClient.invalidateQueries({ queryKey })
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
