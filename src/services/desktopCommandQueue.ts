import { isDesktopRuntime } from '../config/platform'
import type {
  DeleteSyncedCommandsOptions,
  ListPendingCommandsOptions,
} from '../repositories/local/offlineCommandQueueRepository'
import type {
  EnqueueCommandInput,
  OfflineCommand,
} from '../lib/localDb/models/offlineCommand'

async function getQueue() {
  if (!isDesktopRuntime()) {
    throw new Error('The persistent SQLite command queue is only available on desktop.')
  }
  const { localOfflineCommandQueueRepository } = await import(
    '../repositories/local/offlineCommandQueueRepository'
  )
  return localOfflineCommandQueueRepository
}

export async function enqueueCommand(input: EnqueueCommandInput): Promise<OfflineCommand> {
  return (await getQueue()).enqueueCommand(input)
}

export async function getCommand(commandId: string): Promise<OfflineCommand | null> {
  return (await getQueue()).getCommand(commandId)
}

export async function listPendingCommands(
  options?: ListPendingCommandsOptions,
): Promise<OfflineCommand[]> {
  return (await getQueue()).listPendingCommands(options)
}

export async function markSyncing(commandId: string): Promise<OfflineCommand> {
  return (await getQueue()).markSyncing(commandId)
}

export async function markSynced(commandId: string): Promise<OfflineCommand> {
  return (await getQueue()).markSynced(commandId)
}

export async function markFailed(commandId: string, error: string): Promise<OfflineCommand> {
  return (await getQueue()).markFailed(commandId, error)
}

export async function markConflict(commandId: string, error: string): Promise<OfflineCommand> {
  return (await getQueue()).markConflict(commandId, error)
}

export async function retryCommand(commandId: string): Promise<OfflineCommand> {
  return (await getQueue()).retryCommand(commandId)
}

export async function deleteSyncedCommands(
  options?: DeleteSyncedCommandsOptions,
): Promise<number> {
  return (await getQueue()).deleteSyncedCommands(options)
}

export async function recoverInterruptedCommands(): Promise<number> {
  return (await getQueue()).recoverInterruptedCommands()
}

export type {
  DeleteSyncedCommandsOptions,
  ListPendingCommandsOptions,
} from '../repositories/local/offlineCommandQueueRepository'
export type {
  EnqueueCommandInput,
  JsonValue,
  OfflineCommand,
  OfflineCommandPayload,
  OfflineCommandStatus,
  OfflineCommandType,
  OfflineCommandContractVersion,
} from '../lib/localDb/models/offlineCommand'
