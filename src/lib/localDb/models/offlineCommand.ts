export const OFFLINE_COMMAND_STATUSES = [
  'pending',
  'syncing',
  'synced',
  'failed',
  'conflict',
] as const

export type OfflineCommandStatus = (typeof OFFLINE_COMMAND_STATUSES)[number]

/** Command kinds accepted by backend contract version 1. */
export const OFFLINE_COMMAND_TYPES = [
  'inventory_operation',
  'raw_material_operation',
  'return',
  'delete_operation',
  'custody_add',
  'custody_scrap',
] as const

export type OfflineCommandType = (typeof OFFLINE_COMMAND_TYPES)[number]
export type OfflineCommandContractVersion = 1

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type OfflineCommandPayload = { [key: string]: JsonValue }

/** The immutable backend command envelope plus local queue state. */
export interface OfflineCommand {
  commandId: string
  commandType: OfflineCommandType
  contractVersion: OfflineCommandContractVersion
  payload: OfflineCommandPayload
  status: OfflineCommandStatus
  attempts: number
  lastError: string | null
  createdAt: string
  updatedAt: string
  syncedAt: string | null
}

/** Input accepted at the desktop queue boundary. */
export interface EnqueueCommandInput {
  commandId?: string
  commandType: OfflineCommandType
  contractVersion: OfflineCommandContractVersion
  payload: OfflineCommandPayload
}

/** SQLite representation. Kept private to the local persistence layer. */
export interface OfflineCommandRow {
  command_id: unknown
  command_type: unknown
  contract_version: unknown
  payload_json: unknown
  status: unknown
  attempts: unknown
  last_error: unknown
  created_at: unknown
  updated_at: unknown
  synced_at: unknown
}
