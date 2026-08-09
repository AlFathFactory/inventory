import { describe, expect, it, vi } from 'vitest'
import { createOfflineOperation } from './offlineQueueService'

describe('offline operation identity', () => {
  it('creates requestId once and keeps it through retry-shaped state changes', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('00000000-0000-4000-8000-000000000001').mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    const operation = createOfflineOperation({ tableName: 'consumables', itemId: 7, operationType: 'add', quantity: 3, payload: {} })
    const failed = { ...operation, status: 'failed' as const }
    const retried = { ...failed, status: 'pending' as const }
    expect(operation.requestId).toBe('00000000-0000-4000-8000-000000000002')
    expect(retried.requestId).toBe(operation.requestId)
  })

  it('preserves a requestId created by the operation form', () => {
    const operation = createOfflineOperation({
      requestId: 'form-request-id',
      tableName: 'consumables',
      itemId: 7,
      operationType: 'issue',
      quantity: 2,
      payload: { employeeId: 'employee-1' },
    })
    expect(operation.requestId).toBe('form-request-id')
    expect(operation.payload).toMatchObject({ employeeId: 'employee-1' })
  })
})
