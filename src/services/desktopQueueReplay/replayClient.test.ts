import { describe, expect, it, vi } from 'vitest'
import type { OfflineCommand } from '../../lib/localDb/models/offlineCommand'
import {
  APPLY_OFFLINE_COMMAND_RPC,
  createOfflineCommandReplayClient,
} from './replayClient'
import { OfflineCommandRpcError } from './replayContract'

const COMMAND: OfflineCommand = {
  commandId: 'stable-command-id',
  commandType: 'raw_material_operation',
  contractVersion: 1,
  payload: { item_id: 'item-1', operation_type: 'issue', quantity: 4 },
  status: 'syncing',
  attempts: 1,
  lastError: null,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:01.000Z',
  syncedAt: null,
}

describe('offline command RPC client', () => {
  it('calls the backend RPC with only the immutable command envelope', async () => {
    const response = { ok: true, status: 'synced' }
    const rpc = vi.fn(async () => ({ data: response, error: null }))

    await expect(createOfflineCommandReplayClient({ rpc })(COMMAND)).resolves.toBe(response)

    expect(rpc).toHaveBeenCalledWith(APPLY_OFFLINE_COMMAND_RPC, {
      p_command_id: 'stable-command-id',
      p_command_type: 'raw_material_operation',
      p_payload: COMMAND.payload,
      p_contract_version: 1,
    })
  })

  it('preserves PostgREST error code and message in a structured transport error', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    }))

    const promise = createOfflineCommandReplayClient({ rpc })(COMMAND)

    await expect(promise).rejects.toMatchObject<Partial<OfflineCommandRpcError>>({
      details: {
        code: '42501',
        message: 'permission denied',
        sqlstate: '42501',
        retryable: false,
        requiresUserAction: true,
      },
    })
  })
})
