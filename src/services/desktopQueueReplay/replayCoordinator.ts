import { isDesktopRuntime } from '../../config/platform'
import type { OfflineCommand } from '../../lib/localDb/models/offlineCommand'
import { localOfflineCommandQueueRepository } from '../../repositories/local/offlineCommandQueueRepository'
import {
  runDesktopDeltaAfterReplay,
  type DesktopSyncOutcome,
} from '../desktopSync/syncCoordinator'
import { runWithDesktopDataMutex } from '../desktopSync/desktopDataMutex'
import { applyOfflineCommand } from './replayClient'
import {
  invalidResponseError,
  parseOfflineCommandBackendResult,
  serializeOfflineCommandBackendError,
  transportError,
  type OfflineCommandBackendError,
} from './replayContract'

export const REPLAY_BATCH_SIZE = 25
export const MAX_COMMANDS_PER_REPLAY_PASS = 250

export interface ReplayQueue {
  recoverInterruptedCommands(): Promise<number>
  listPendingCommands(options: {
    limit: number
    createdAtOrBefore: string
  }): Promise<OfflineCommand[]>
  markSyncing(commandId: string): Promise<OfflineCommand>
  markSynced(commandId: string): Promise<OfflineCommand>
  markFailed(commandId: string, error: string): Promise<OfflineCommand>
  markConflict(commandId: string, error: string): Promise<OfflineCommand>
}

export interface QueueReplayDependencies {
  isDesktop: () => boolean
  queue: ReplayQueue
  applyCommand: (command: OfflineCommand) => Promise<unknown>
  runExclusive: <T>(operation: () => Promise<T>) => Promise<T>
  runDeltaSync: () => Promise<DesktopSyncOutcome>
  now: () => Date
}

interface ReplayCounts {
  processed: number
  synced: number
  failed: number
  conflicts: number
}

export type QueueReplayOutcome =
  | { status: 'skipped'; reason: 'web' }
  | ({
      status: 'succeeded'
      reachedPassLimit: boolean
      syncOutcome: DesktopSyncOutcome
    } & ReplayCounts)
  | ({
      status: 'stopped'
      reason: 'transient_failure'
      stoppedCommandId: string
      error: OfflineCommandBackendError
      syncOutcome: DesktopSyncOutcome | null
    } & ReplayCounts)
  | ({ status: 'failed'; error: string } & ReplayCounts)

interface PassResult extends ReplayCounts {
  status: 'succeeded' | 'stopped'
  reachedPassLimit: boolean
  stoppedCommandId?: string
  error?: OfflineCommandBackendError
}

function emptyCounts(): ReplayCounts {
  return { processed: 0, synced: 0, failed: 0, conflicts: 0 }
}

export function createDesktopQueueReplayCoordinator(dependencies: QueueReplayDependencies) {
  let inFlight: Promise<QueueReplayOutcome> | null = null

  function run(): Promise<QueueReplayOutcome> {
    if (!dependencies.isDesktop()) {
      return Promise.resolve({ status: 'skipped', reason: 'web' })
    }
    if (inFlight) return inFlight

    inFlight = execute().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  async function execute(): Promise<QueueReplayOutcome> {
    let pass: PassResult
    try {
      pass = await dependencies.runExclusive(() => replayPendingCommands(dependencies))
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        ...emptyCounts(),
      }
    }

    // A completed pass always refreshes authoritative state. If a transient
    // stops a later command, refresh only when earlier commands did sync.
    const syncOutcome = pass.status === 'succeeded' || pass.synced > 0
      ? await dependencies.runDeltaSync()
      : null

    if (pass.status === 'stopped') {
      return {
        status: 'stopped',
        reason: 'transient_failure',
        stoppedCommandId: pass.stoppedCommandId!,
        error: pass.error!,
        syncOutcome,
        processed: pass.processed,
        synced: pass.synced,
        failed: pass.failed,
        conflicts: pass.conflicts,
      }
    }
    return {
      status: 'succeeded',
      reachedPassLimit: pass.reachedPassLimit,
      syncOutcome: syncOutcome!,
      processed: pass.processed,
      synced: pass.synced,
      failed: pass.failed,
      conflicts: pass.conflicts,
    }
  }

  return { run }
}

async function replayPendingCommands(
  dependencies: QueueReplayDependencies,
): Promise<PassResult> {
  const counts = emptyCounts()
  const createdAtOrBefore = dependencies.now().toISOString()
  await dependencies.queue.recoverInterruptedCommands()

  while (counts.processed < MAX_COMMANDS_PER_REPLAY_PASS) {
    const batch = await dependencies.queue.listPendingCommands({
      limit: Math.min(REPLAY_BATCH_SIZE, MAX_COMMANDS_PER_REPLAY_PASS - counts.processed),
      createdAtOrBefore,
    })
    if (batch.length === 0) {
      return { status: 'succeeded', reachedPassLimit: false, ...counts }
    }

    for (const pending of batch) {
      const command = await dependencies.queue.markSyncing(pending.commandId)
      counts.processed += 1

      let rawResult: unknown
      try {
        rawResult = await dependencies.applyCommand(command)
      } catch (error) {
        const details = transportError(error)
        await dependencies.queue.markFailed(
          command.commandId,
          serializeOfflineCommandBackendError(details),
        )
        counts.failed += 1
        if (details.retryable && !details.requiresUserAction) {
          return {
            status: 'stopped',
            reachedPassLimit: false,
            stoppedCommandId: command.commandId,
            error: details,
            ...counts,
          }
        }
        continue
      }

      let result
      try {
        result = parseOfflineCommandBackendResult(rawResult, command)
      } catch (error) {
        const details = invalidResponseError(error)
        await dependencies.queue.markFailed(
          command.commandId,
          serializeOfflineCommandBackendError(details),
        )
        counts.failed += 1
        continue
      }

      if (result.status === 'synced') {
        await dependencies.queue.markSynced(command.commandId)
        counts.synced += 1
        continue
      }

      const serializedError = serializeOfflineCommandBackendError(result.error)
      if (result.status === 'conflict') {
        await dependencies.queue.markConflict(command.commandId, serializedError)
        counts.conflicts += 1
      } else {
        await dependencies.queue.markFailed(command.commandId, serializedError)
        counts.failed += 1
      }

      if (result.error.retryable && !result.error.requiresUserAction) {
        return {
          status: 'stopped',
          reachedPassLimit: false,
          stoppedCommandId: command.commandId,
          error: result.error,
          ...counts,
        }
      }
    }
  }

  return { status: 'succeeded', reachedPassLimit: true, ...counts }
}

const productionCoordinator = createDesktopQueueReplayCoordinator({
  isDesktop: isDesktopRuntime,
  queue: localOfflineCommandQueueRepository,
  applyCommand: applyOfflineCommand,
  runExclusive: runWithDesktopDataMutex,
  runDeltaSync: runDesktopDeltaAfterReplay,
  now: () => new Date(),
})

export const runDesktopQueueReplay = productionCoordinator.run
