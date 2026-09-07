import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isDesktopRuntime } from '../../config/platform'
import {
  hydrateDesktopSyncStatus,
  runDesktopSync,
  type DesktopSyncOutcome,
} from '../../services/desktopSync/syncCoordinator'
import {
  getDesktopSyncSnapshot,
  subscribeToDesktopSync,
  type DesktopSyncSnapshot,
} from '../../services/desktopSync/syncStatusStore'

export interface DesktopSyncController extends DesktopSyncSnapshot {
  /** False on web, so components render nothing instead of branching. */
  isEnabled: boolean
  isSyncing: boolean
  refresh: () => Promise<DesktopSyncOutcome>
}

/**
 * Sync status plus the manual refresh action.
 *
 * This is the only place the runtime is inspected for sync, so the status
 * component stays platform-agnostic. Refresh delegates to the shared
 * coordinator, which owns the mutex — concurrent calls collapse onto one run.
 */
export function useDesktopSync(): DesktopSyncController {
  const queryClient = useQueryClient()
  const snapshot = useSyncExternalStore(
    subscribeToDesktopSync,
    getDesktopSyncSnapshot,
    getDesktopSyncSnapshot,
  )
  const isEnabled = isDesktopRuntime()

  // The startup pass may have run before React mounted; make sure the
  // persisted last-success time is published even if it did not.
  useEffect(() => {
    if (!isEnabled || snapshot.hydrated) return
    void hydrateDesktopSyncStatus().catch(() => {
      // Status is cosmetic — never let it surface as an app error.
    })
  }, [isEnabled, snapshot.hydrated])

  // The startup pass can finish after the first screens have already read
  // SQLite; refresh their cached results when it lands.
  const lastSeenSuccess = useRef<string | null>(null)
  useEffect(() => {
    if (!isEnabled || !snapshot.lastSuccessfulSyncAt) return
    const previous = lastSeenSuccess.current
    lastSeenSuccess.current = snapshot.lastSuccessfulSyncAt
    if (previous !== null && previous !== snapshot.lastSuccessfulSyncAt) {
      void queryClient.invalidateQueries()
    }
  }, [isEnabled, snapshot.lastSuccessfulSyncAt, queryClient])

  const refresh = useCallback(async () => {
    const outcome = await runDesktopSync()
    if (outcome.status === 'succeeded') {
      // Local tables changed underneath the cached reads.
      await queryClient.invalidateQueries()
    }
    return outcome
  }, [queryClient])

  return {
    ...snapshot,
    isEnabled,
    isSyncing: snapshot.phase === 'syncing',
    refresh,
  }
}
