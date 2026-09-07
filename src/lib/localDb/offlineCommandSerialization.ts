import {
  OFFLINE_COMMAND_STATUSES,
  OFFLINE_COMMAND_TYPES,
  type JsonValue,
  type OfflineCommand,
  type OfflineCommandPayload,
  type OfflineCommandRow,
  type OfflineCommandStatus,
  type OfflineCommandType,
} from './models/offlineCommand'

function serializeJson(value: JsonValue, ancestors: Set<object>): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Command payload numbers must be finite.')
    return JSON.stringify(value)
  }
  if (typeof value !== 'object') {
    throw new TypeError('Command payload contains a value that JSON cannot represent.')
  }
  if (ancestors.has(value)) throw new TypeError('Command payload must not contain cycles.')

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => serializeJson(entry, ancestors)).join(',')}]`
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Command payload must contain only JSON objects and arrays.')
    }
    const entries = Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${serializeJson(value[key], ancestors)}`
    ))
    return `{${entries.join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

/** Deterministic JSON used for both persistence and duplicate comparison. */
export function serializeCanonicalPayload(payload: OfflineCommandPayload): string {
  return serializeJson(payload, new Set())
}

export function parseCanonicalPayload(payloadJson: unknown): OfflineCommandPayload {
  if (typeof payloadJson !== 'string') throw new Error('Invalid offline command payload storage.')
  const parsed: unknown = JSON.parse(payloadJson)
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Offline command payload must be a JSON object.')
  }
  const payload = parsed as OfflineCommandPayload
  if (serializeCanonicalPayload(payload) !== payloadJson) {
    throw new Error('Offline command payload is not canonical JSON.')
  }
  return payload
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid offline command ${field}.`)
  }
  return value
}

function optionalText(value: unknown, field: string): string | null {
  if (value === null) return null
  return requireText(value, field)
}

function requireInteger(value: unknown, field: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`Invalid offline command ${field}.`)
  }
  return value
}

function requireStatus(value: unknown): OfflineCommandStatus {
  if (typeof value === 'string' && OFFLINE_COMMAND_STATUSES.some((status) => status === value)) {
    return value as OfflineCommandStatus
  }
  throw new Error('Invalid offline command status.')
}

function requireCommandType(value: unknown): OfflineCommandType {
  if (typeof value === 'string' && OFFLINE_COMMAND_TYPES.some((type) => type === value)) {
    return value as OfflineCommandType
  }
  throw new Error('Invalid offline command type for contract version 1.')
}

function requireContractVersion(value: unknown): 1 {
  if (requireInteger(value, 'contract_version', 1) !== 1) {
    throw new Error('Unsupported offline command contract version.')
  }
  return 1
}

export function deserializeOfflineCommand(row: OfflineCommandRow): OfflineCommand {
  return {
    commandId: requireText(row.command_id, 'command_id'),
    commandType: requireCommandType(row.command_type),
    contractVersion: requireContractVersion(row.contract_version),
    payload: parseCanonicalPayload(row.payload_json),
    status: requireStatus(row.status),
    attempts: requireInteger(row.attempts, 'attempts', 0),
    lastError: optionalText(row.last_error, 'last_error'),
    createdAt: requireText(row.created_at, 'created_at'),
    updatedAt: requireText(row.updated_at, 'updated_at'),
    syncedAt: optionalText(row.synced_at, 'synced_at'),
  }
}
