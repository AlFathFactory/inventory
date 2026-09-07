import type { OfflineCommand } from '../../lib/localDb/models/offlineCommand'
import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../../lib/supabaseClient'
import { OfflineCommandRpcError } from './replayContract'

export const APPLY_OFFLINE_COMMAND_RPC = 'apply_inventory_offline_command_rpc'

interface RpcResult {
  data: unknown
  error: null | { code?: string; message?: string }
}

export interface OfflineCommandRpcClient {
  rpc(functionName: string, parameters: Record<string, unknown>): PromiseLike<RpcResult>
}

export function createOfflineCommandReplayClient(client: OfflineCommandRpcClient) {
  return async function applyOfflineCommand(command: OfflineCommand): Promise<unknown> {
    const { data, error } = await client.rpc(APPLY_OFFLINE_COMMAND_RPC, {
      p_command_id: command.commandId,
      p_command_type: command.commandType,
      p_payload: command.payload,
      p_contract_version: command.contractVersion,
    })
    if (error) {
      const sqlstate = typeof error.code === 'string' && error.code.length > 0
        ? error.code
        : null
      const requiresUserAction = sqlstate === '42501' || sqlstate?.startsWith('PGRST') === true
      throw new OfflineCommandRpcError({
        code: sqlstate ?? 'rpc_transport_error',
        message: error.message || 'The offline command RPC could not be reached.',
        sqlstate,
        retryable: !requiresUserAction,
        requiresUserAction,
      })
    }
    return data
  }
}

export async function applyOfflineCommand(command: OfflineCommand): Promise<unknown> {
  if (!isSupabaseConfigured || !supabaseClient) {
    throw new OfflineCommandRpcError({
      code: 'supabase_not_configured',
      message: getSupabaseConfigError(),
      sqlstate: null,
      retryable: false,
      requiresUserAction: true,
    })
  }
  return createOfflineCommandReplayClient(supabaseClient)(command)
}
