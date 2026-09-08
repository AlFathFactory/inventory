import { isDesktopRuntime } from '../config/platform'
import type {
  OfflineCommand,
  OfflineCommandType,
} from '../lib/localDb/models/offlineCommand'
import {
  getCommand,
  getCommandStatusCounts,
  listRecentNonSyncedCommands,
  retryCommand,
  type OfflineCommandStatusCounts,
} from './desktopCommandQueue'

export const QUEUE_PANEL_STATUSES = [
  'pending',
  'syncing',
  'failed',
  'conflict',
] as const

export type QueuePanelStatus = (typeof QUEUE_PANEL_STATUSES)[number]
export type QueuePanelCounts = Record<QueuePanelStatus, number>

export interface QueuePanelError {
  code: string | null
  message: string
  retryable: boolean | null
  requiresUserAction: boolean | null
}

export interface QueuePanelCommand {
  commandId: string
  commandType: OfflineCommandType
  createdAt: string
  attempts: number
  status: QueuePanelStatus
  error: QueuePanelError | null
  canRetry: boolean
}

export interface QueuePanelSnapshot {
  counts: QueuePanelCounts
  commands: QueuePanelCommand[]
}

export interface DesktopQueuePanelDependencies {
  isDesktop: () => boolean
  getCommand: (commandId: string) => Promise<OfflineCommand | null>
  getCounts: () => Promise<OfflineCommandStatusCounts>
  listRecent: (options: { limit: number }) => Promise<OfflineCommand[]>
  retry: (commandId: string) => Promise<OfflineCommand>
  replay: () => Promise<unknown>
}

export class OfflineCommandRetryNotAllowedError extends Error {
  constructor(commandId: string) {
    super(`Offline command ${commandId} is not allowed to retry.`)
    this.name = 'OfflineCommandRetryNotAllowedError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function parseQueuePanelError(lastError: string | null): QueuePanelError | null {
  if (!lastError) return null
  try {
    const parsed: unknown = JSON.parse(lastError)
    if (isRecord(parsed)) {
      return {
        code: optionalString(parsed.code),
        message: optionalString(parsed.message) ?? lastError,
        retryable: optionalBoolean(parsed.retryable),
        requiresUserAction: optionalBoolean(
          parsed.requires_user_action ?? parsed.requiresUserAction,
        ),
      }
    }
  } catch {
    // Older local diagnostics are plain text and stay visible, but are not retryable.
  }
  return {
    code: null,
    message: lastError,
    retryable: null,
    requiresUserAction: null,
  }
}

export function toQueuePanelCommand(command: OfflineCommand): QueuePanelCommand {
  const error = parseQueuePanelError(command.lastError)
  const status = command.status as QueuePanelStatus
  return {
    commandId: command.commandId,
    commandType: command.commandType,
    createdAt: command.createdAt,
    attempts: command.attempts,
    status,
    error,
    canRetry: command.status === 'failed'
      && error?.retryable === true
      && error.requiresUserAction === false,
  }
}

function panelCounts(counts: OfflineCommandStatusCounts): QueuePanelCounts {
  return {
    pending: counts.pending,
    syncing: counts.syncing,
    failed: counts.failed,
    conflict: counts.conflict,
  }
}

const EMPTY_SNAPSHOT: QueuePanelSnapshot = {
  counts: { pending: 0, syncing: 0, failed: 0, conflict: 0 },
  commands: [],
}

export function createDesktopQueuePanelService(
  dependencies: DesktopQueuePanelDependencies,
) {
  let actionInFlight: Promise<QueuePanelSnapshot> | null = null

  async function load(limit = 50): Promise<QueuePanelSnapshot> {
    if (!dependencies.isDesktop()) return EMPTY_SNAPSHOT
    const [counts, commands] = await Promise.all([
      dependencies.getCounts(),
      dependencies.listRecent({ limit }),
    ])
    return {
      counts: panelCounts(counts),
      commands: commands
        .filter((command) => command.status !== 'synced')
        .map(toQueuePanelCommand),
    }
  }

  function runAction(action: () => Promise<void>) {
    if (actionInFlight) return actionInFlight
    actionInFlight = action()
      .then(() => load())
      .finally(() => {
        actionInFlight = null
      })
    return actionInFlight
  }

  function replayPending() {
    if (!dependencies.isDesktop()) return Promise.resolve(EMPTY_SNAPSHOT)
    return runAction(async () => {
      await dependencies.replay()
    })
  }

  function retryFailed(commandId: string) {
    if (!dependencies.isDesktop()) return Promise.resolve(EMPTY_SNAPSHOT)
    return runAction(async () => {
      const command = await dependencies.getCommand(commandId)
      if (!command || !toQueuePanelCommand(command).canRetry) {
        throw new OfflineCommandRetryNotAllowedError(commandId)
      }
      await dependencies.retry(command.commandId)
      await dependencies.replay()
    })
  }

  return { load, replayPending, retryFailed }
}

const productionService = createDesktopQueuePanelService({
  isDesktop: isDesktopRuntime,
  getCommand,
  getCounts: getCommandStatusCounts,
  listRecent: listRecentNonSyncedCommands,
  retry: retryCommand,
  replay: async () => (await import('./desktopQueueReplay')).runDesktopQueueReplay(),
})

export const loadDesktopQueuePanel = productionService.load
export const replayPendingDesktopCommands = productionService.replayPending
export const retryFailedDesktopCommand = productionService.retryFailed
