import { isDesktopRuntime } from '../../config/platform'
import { serializeCanonicalPayload } from '../../lib/localDb/offlineCommandSerialization'
import type {
  EnqueueCommandInput,
  OfflineCommand,
} from '../../lib/localDb/models/offlineCommand'
import { enqueueCommand, getCommand } from '../desktopCommandQueue'
import { probeSupabaseReachability } from '../connectivityService'
import {
  applyInventoryOperation,
  type ApplyInventoryOperationParams,
} from '../operationsService'
import {
  buildInventoryOperationCommand,
  type InventoryCommandEnvelope,
} from './inventoryCommandBuilders'

export type InventoryWriteError = {
  code: string | null
  message: string
  sqlstate: string | null
  retryable: boolean | null
  requiresUserAction: boolean | null
  raw: string | null
}

type InventoryWriteSuccessStatus = 'queued' | 'syncing' | 'synced'
type InventoryWriteErrorStatus = 'failed' | 'conflict'

export type InventoryWriteResult =
  | {
      status: InventoryWriteSuccessStatus
      commandId: string
      runtime: 'web' | 'desktop'
    }
  | {
      status: InventoryWriteErrorStatus
      commandId: string
      runtime: 'desktop'
      error: InventoryWriteError
    }

export interface InventoryWriteDependencies {
  isDesktop: () => boolean
  createCommandId: () => string
  writeDirect: (params: ApplyInventoryOperationParams) => Promise<unknown>
  enqueue: (input: EnqueueCommandInput) => Promise<OfflineCommand>
  getQueuedCommand: (commandId: string) => Promise<OfflineCommand | null>
  isOnline: () => Promise<boolean>
  replay: () => Promise<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isLegacyWebQueueResult(value: unknown) {
  return isRecord(value) && value.offline === true
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function parseCommandError(lastError: string | null): InventoryWriteError {
  if (lastError) {
    try {
      const parsed: unknown = JSON.parse(lastError)
      if (isRecord(parsed)) {
        return {
          code: optionalString(parsed.code),
          message: optionalString(parsed.message) ?? lastError,
          sqlstate: optionalString(parsed.sqlstate),
          retryable: optionalBoolean(parsed.retryable),
          requiresUserAction: optionalBoolean(parsed.requires_user_action),
          raw: lastError,
        }
      }
    } catch {
      // Older or locally produced diagnostics may be plain text.
    }
  }
  return {
    code: null,
    message: lastError ?? 'The queued inventory command failed.',
    sqlstate: null,
    retryable: null,
    requiresUserAction: null,
    raw: lastError,
  }
}

function resultFromCommand(command: OfflineCommand): InventoryWriteResult {
  if (command.status === 'failed' || command.status === 'conflict') {
    return {
      status: command.status,
      commandId: command.commandId,
      runtime: 'desktop',
      error: parseCommandError(command.lastError),
    }
  }
  return {
    status: command.status === 'pending' ? 'queued' : command.status,
    commandId: command.commandId,
    runtime: 'desktop',
  }
}

function envelopeFingerprint(command: InventoryCommandEnvelope) {
  return `${command.commandType}:${command.contractVersion}:${serializeCanonicalPayload(command.payload)}`
}

export function createInventoryWriteService(dependencies: InventoryWriteDependencies) {
  const inFlight = new Map<string, {
    fingerprint: string
    promise: Promise<InventoryWriteResult>
  }>()

  async function writeDesktop(command: InventoryCommandEnvelope): Promise<InventoryWriteResult> {
    const queued = await dependencies.enqueue(command)
    let online = false
    try {
      online = await dependencies.isOnline()
    } catch {
      online = false
    }
    if (!online) return resultFromCommand(queued)

    try {
      await dependencies.replay()
    } catch {
      // The command is already durable. Its persisted state remains authoritative.
    }
    const current = await dependencies.getQueuedCommand(command.commandId)
    return resultFromCommand(current ?? queued)
  }

  async function write(params: ApplyInventoryOperationParams): Promise<InventoryWriteResult> {
    if (!dependencies.isDesktop()) {
      const commandId = params.requestId ?? dependencies.createCommandId()
      const directResult = await dependencies.writeDirect({ ...params, requestId: commandId })
      return {
        status: isLegacyWebQueueResult(directResult) ? 'queued' : 'synced',
        commandId,
        runtime: 'web',
      }
    }

    const command = buildInventoryOperationCommand(params, dependencies.createCommandId)
    const fingerprint = envelopeFingerprint(command)
    const active = inFlight.get(command.commandId)
    if (active?.fingerprint === fingerprint) return active.promise

    const promise = writeDesktop(command).finally(() => {
      if (inFlight.get(command.commandId)?.promise === promise) {
        inFlight.delete(command.commandId)
      }
    })
    inFlight.set(command.commandId, { fingerprint, promise })
    return promise
  }

  return { write }
}

const productionService = createInventoryWriteService({
  isDesktop: isDesktopRuntime,
  createCommandId: () => crypto.randomUUID(),
  writeDirect: applyInventoryOperation,
  enqueue: enqueueCommand,
  getQueuedCommand: getCommand,
  isOnline: () => probeSupabaseReachability({ force: true }),
  replay: async () => (await import('../desktopQueueReplay')).runDesktopQueueReplay(),
})

export const writeInventoryOperation = productionService.write

export function isPendingInventoryWrite(result: InventoryWriteResult) {
  return result.status === 'queued' || result.status === 'syncing'
}

export function requireAcceptedInventoryWrite(result: InventoryWriteResult) {
  if (result.status === 'failed' || result.status === 'conflict') {
    throw new Error(result.error.message)
  }
  return result
}
