import { isDesktopRuntime } from '../../config/platform'
import { serializeCanonicalPayload } from '../../lib/localDb/offlineCommandSerialization'
import type {
  EnqueueCommandInput,
  OfflineCommand,
} from '../../lib/localDb/models/offlineCommand'
import { enqueueCommand, getCommand } from '../desktopCommandQueue'
import { probeSupabaseReachability } from '../connectivityService'
import {
  addEmployeeCustodyItem,
  scrapEmployeeCustodyItem,
} from '../../features/employee-custody/employeeCustodyService'
import type {
  AddEmployeeCustodyInput,
  ScrapEmployeeCustodyInput,
} from '../../features/employee-custody/types'
import {
  applyRawMaterialOperationWithProject,
  type RawMaterialOperationInput,
} from '../rawMaterialsService'
import {
  applyInventoryOperation,
  deleteInventoryOperation,
  returnInventoryItem,
  type ApplyInventoryOperationParams,
  type ReturnInventoryOperationParams,
} from '../operationsService'
import {
  buildInventoryOperationCommand,
} from './inventoryCommandBuilders'
import {
  buildInventoryDeleteCommand,
  buildInventoryReturnCommand,
  type DeleteInventoryOperationParams,
} from './returnDeleteCommandBuilders'
import {
  buildRawMaterialOperationCommand,
  type RawMaterialCommandInput,
} from './rawMaterialCommandBuilder'
import {
  buildCustodyAddCommand,
  buildCustodyScrapCommand,
} from './custodyCommandBuilders'

type DesktopWriteCommandEnvelope = EnqueueCommandInput & { commandId: string }

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

export type CustodyBatchWriteResult = {
  savedCount: number
  pendingCount: number
  failures: Array<{ index: number; message: string }>
  results: InventoryWriteResult[]
}

export interface InventoryWriteDependencies {
  isDesktop: () => boolean
  createCommandId: () => string
  writeInventoryDirect: (params: ApplyInventoryOperationParams) => Promise<unknown>
  writeReturnDirect: (params: ReturnInventoryOperationParams) => Promise<unknown>
  writeDeleteDirect: (operationId: string | number, deletedBy: string) => Promise<unknown>
  writeRawMaterialDirect: (params: RawMaterialOperationInput) => Promise<unknown>
  writeCustodyAddDirect: (params: AddEmployeeCustodyInput) => Promise<unknown>
  writeCustodyScrapDirect: (params: ScrapEmployeeCustodyInput) => Promise<unknown>
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

function envelopeFingerprint(command: DesktopWriteCommandEnvelope) {
  return `${command.commandType}:${command.contractVersion}:${serializeCanonicalPayload(command.payload)}`
}

export function createInventoryWriteService(dependencies: InventoryWriteDependencies) {
  const inFlight = new Map<string, {
    fingerprint: string
    promise: Promise<InventoryWriteResult>
  }>()

  async function writeDesktop(command: DesktopWriteCommandEnvelope): Promise<InventoryWriteResult> {
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

  function writeCommand(command: DesktopWriteCommandEnvelope) {
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

  async function writeInventory(params: ApplyInventoryOperationParams): Promise<InventoryWriteResult> {
    if (!dependencies.isDesktop()) {
      const commandId = params.requestId ?? dependencies.createCommandId()
      const directResult = await dependencies.writeInventoryDirect({ ...params, requestId: commandId })
      return {
        status: isLegacyWebQueueResult(directResult) ? 'queued' : 'synced',
        commandId,
        runtime: 'web',
      }
    }

    const command = buildInventoryOperationCommand(params, dependencies.createCommandId)
    return writeCommand(command)
  }

  async function writeReturn(params: ReturnInventoryOperationParams): Promise<InventoryWriteResult> {
    if (!dependencies.isDesktop()) {
      const commandId = params.requestId ?? dependencies.createCommandId()
      await dependencies.writeReturnDirect({ ...params, requestId: commandId })
      return { status: 'synced', commandId, runtime: 'web' }
    }
    return writeCommand(buildInventoryReturnCommand(params, dependencies.createCommandId))
  }

  async function writeDelete(params: DeleteInventoryOperationParams): Promise<InventoryWriteResult> {
    if (!dependencies.isDesktop()) {
      const commandId = params.requestId ?? dependencies.createCommandId()
      await dependencies.writeDeleteDirect(params.operationId, params.deletedBy || 'user')
      return { status: 'synced', commandId, runtime: 'web' }
    }
    return writeCommand(buildInventoryDeleteCommand(params, dependencies.createCommandId))
  }

  async function writeRawMaterial(params: RawMaterialCommandInput): Promise<InventoryWriteResult> {
    if (!dependencies.isDesktop()) {
      const commandId = params.requestId ?? dependencies.createCommandId()
      await dependencies.writeRawMaterialDirect({ ...params, requestId: commandId })
      return { status: 'synced', commandId, runtime: 'web' }
    }
    return writeCommand(buildRawMaterialOperationCommand(params, dependencies.createCommandId))
  }

  async function writeCustodyAdd(params: AddEmployeeCustodyInput): Promise<InventoryWriteResult> {
    if (!dependencies.isDesktop()) {
      const commandId = params.requestId ?? dependencies.createCommandId()
      await dependencies.writeCustodyAddDirect(params)
      return { status: 'synced', commandId, runtime: 'web' }
    }
    return writeCommand(buildCustodyAddCommand(params, dependencies.createCommandId))
  }

  async function writeCustodyScrap(params: ScrapEmployeeCustodyInput): Promise<InventoryWriteResult> {
    if (!dependencies.isDesktop()) {
      const commandId = params.requestId ?? dependencies.createCommandId()
      await dependencies.writeCustodyScrapDirect(params)
      return { status: 'synced', commandId, runtime: 'web' }
    }
    return writeCommand(buildCustodyScrapCommand(params, dependencies.createCommandId))
  }

  async function writeCustodyAdds(
    items: AddEmployeeCustodyInput[],
  ): Promise<CustodyBatchWriteResult> {
    const settled = await Promise.allSettled(items.map((item) => writeCustodyAdd(item)))
    const results: InventoryWriteResult[] = []
    const failures: Array<{ index: number; message: string }> = []

    settled.forEach((outcome, index) => {
      if (outcome.status === 'rejected') {
        failures.push({
          index,
          message: outcome.reason instanceof Error
            ? outcome.reason.message
            : 'Unable to register the custody item.',
        })
        return
      }
      results.push(outcome.value)
      if (outcome.value.status === 'failed' || outcome.value.status === 'conflict') {
        failures.push({ index, message: outcome.value.error.message })
      }
    })

    return {
      savedCount: items.length - failures.length,
      pendingCount: results.filter(isPendingInventoryWrite).length,
      failures,
      results,
    }
  }

  return {
    write: writeInventory,
    writeInventory,
    writeReturn,
    writeDelete,
    writeRawMaterial,
    writeCustodyAdd,
    writeCustodyAdds,
    writeCustodyScrap,
  }
}

const productionService = createInventoryWriteService({
  isDesktop: isDesktopRuntime,
  createCommandId: () => crypto.randomUUID(),
  writeInventoryDirect: applyInventoryOperation,
  writeReturnDirect: returnInventoryItem,
  writeDeleteDirect: deleteInventoryOperation,
  writeRawMaterialDirect: applyRawMaterialOperationWithProject,
  writeCustodyAddDirect: addEmployeeCustodyItem,
  writeCustodyScrapDirect: scrapEmployeeCustodyItem,
  enqueue: enqueueCommand,
  getQueuedCommand: getCommand,
  isOnline: () => probeSupabaseReachability({ force: true }),
  replay: async () => (await import('../desktopQueueReplay')).runDesktopQueueReplay(),
})

export const writeInventoryOperation = productionService.writeInventory
export const writeInventoryReturn = productionService.writeReturn
export const writeInventoryDelete = productionService.writeDelete
export const writeRawMaterialOperation = productionService.writeRawMaterial
export const writeEmployeeCustodyAdd = productionService.writeCustodyAdd
export const writeEmployeeCustodyAdds = productionService.writeCustodyAdds
export const writeEmployeeCustodyScrap = productionService.writeCustodyScrap

export function isPendingInventoryWrite(result: InventoryWriteResult) {
  return result.status === 'queued' || result.status === 'syncing'
}

export function requireAcceptedInventoryWrite(result: InventoryWriteResult) {
  if (result.status === 'failed' || result.status === 'conflict') {
    throw new Error(result.error.message)
  }
  return result
}
