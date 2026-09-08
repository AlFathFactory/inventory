import { useCallback, useEffect, useRef, useState } from 'react'
import { isDesktopRuntime } from '../../config/platform'
import {
  loadDesktopQueuePanel,
  replayPendingDesktopCommands,
  retryFailedDesktopCommand,
  type QueuePanelSnapshot,
} from '../../services/desktopQueuePanelService'

const EMPTY_SNAPSHOT: QueuePanelSnapshot = {
  counts: { pending: 0, syncing: 0, failed: 0, conflict: 0 },
  commands: [],
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'تعذر تحميل قائمة انتظار المزامنة.'
}

export interface DesktopQueuePanelController extends QueuePanelSnapshot {
  isEnabled: boolean
  isLoading: boolean
  isActing: boolean
  actionError: string | null
  refresh: () => Promise<void>
  replayPending: () => Promise<void>
  retryFailed: (commandId: string) => Promise<void>
}

export function useDesktopQueuePanel(open: boolean): DesktopQueuePanelController {
  const isEnabled = isDesktopRuntime()
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT)
  const [isLoading, setIsLoading] = useState(false)
  const [isActing, setIsActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const actionInFlight = useRef<Promise<void> | null>(null)

  const refresh = useCallback(async () => {
    if (!isEnabled) return
    setIsLoading(true)
    setActionError(null)
    try {
      setSnapshot(await loadDesktopQueuePanel())
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [isEnabled])

  useEffect(() => {
    if (open && isEnabled) void refresh()
  }, [isEnabled, open, refresh])

  const runAction = useCallback((action: () => Promise<QueuePanelSnapshot>) => {
    if (actionInFlight.current) return actionInFlight.current
    setIsActing(true)
    setActionError(null)
    const promise = action()
      .then(setSnapshot)
      .catch((error: unknown) => setActionError(errorMessage(error)))
      .finally(() => {
        actionInFlight.current = null
        setIsActing(false)
      })
    actionInFlight.current = promise
    return promise
  }, [])

  const replayPending = useCallback(
    () => runAction(replayPendingDesktopCommands),
    [runAction],
  )
  const retryFailed = useCallback(
    (commandId: string) => runAction(() => retryFailedDesktopCommand(commandId)),
    [runAction],
  )

  return {
    ...snapshot,
    isEnabled,
    isLoading,
    isActing,
    actionError,
    refresh,
    replayPending,
    retryFailed,
  }
}
