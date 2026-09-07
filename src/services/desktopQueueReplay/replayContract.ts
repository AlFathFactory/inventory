import type { OfflineCommand } from '../../lib/localDb/models/offlineCommand'

export interface OfflineCommandBackendError {
  code: string
  message: string
  sqlstate: string | null
  retryable: boolean
  requiresUserAction: boolean
}

export type OfflineCommandBackendResult =
  | {
      status: 'synced'
      idempotency: string | null
    }
  | {
      status: 'failed' | 'conflict'
      error: OfflineCommandBackendError
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Offline command response has invalid ${field}.`)
  }
  return value
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null
  return requireText(value, field)
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Offline command response has invalid ${field}.`)
  }
  return value
}

/** Validates both the result and the backend's echoed immutable envelope. */
export function parseOfflineCommandBackendResult(
  value: unknown,
  command: OfflineCommand,
): OfflineCommandBackendResult {
  if (!isRecord(value)) throw new Error('Offline command RPC returned a non-object response.')
  if (value.command_id !== command.commandId) {
    throw new Error('Offline command RPC returned a mismatched command_id.')
  }
  if (value.command_type !== command.commandType) {
    throw new Error('Offline command RPC returned a mismatched command_type.')
  }
  if (value.contract_version !== command.contractVersion) {
    throw new Error('Offline command RPC returned a mismatched contract_version.')
  }

  if (value.status === 'synced' && value.ok === true) {
    return {
      status: 'synced',
      idempotency: optionalText(value.idempotency, 'idempotency'),
    }
  }

  if ((value.status === 'failed' || value.status === 'conflict') && value.ok === false) {
    if (!isRecord(value.error)) {
      throw new Error('Offline command RPC returned no structured error.')
    }
    return {
      status: value.status,
      error: {
        code: requireText(value.error.code, 'error.code'),
        message: requireText(value.error.message, 'error.message'),
        sqlstate: optionalText(value.error.sqlstate, 'error.sqlstate'),
        retryable: requireBoolean(value.error.retryable, 'error.retryable'),
        requiresUserAction: requireBoolean(
          value.error.requires_user_action,
          'error.requires_user_action',
        ),
      },
    }
  }

  throw new Error('Offline command RPC returned an unsupported status envelope.')
}

/** Stores every backend policy field in the queue's text diagnostic column. */
export function serializeOfflineCommandBackendError(
  error: OfflineCommandBackendError,
): string {
  return JSON.stringify({
    code: error.code,
    message: error.message,
    sqlstate: error.sqlstate,
    retryable: error.retryable,
    requires_user_action: error.requiresUserAction,
  })
}

export function invalidResponseError(error: unknown): OfflineCommandBackendError {
  return {
    code: 'invalid_backend_response',
    message: error instanceof Error ? error.message : String(error),
    sqlstate: null,
    retryable: false,
    requiresUserAction: true,
  }
}

export function transportError(error: unknown): OfflineCommandBackendError {
  if (error instanceof OfflineCommandRpcError) return error.details
  return {
    code: 'rpc_transport_error',
    message: error instanceof Error ? error.message : String(error),
    sqlstate: null,
    retryable: true,
    requiresUserAction: false,
  }
}

export class OfflineCommandRpcError extends Error {
  readonly details: OfflineCommandBackendError

  constructor(details: OfflineCommandBackendError) {
    super(details.message)
    this.name = 'OfflineCommandRpcError'
    this.details = details
  }
}
