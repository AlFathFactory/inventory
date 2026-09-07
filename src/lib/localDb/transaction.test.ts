import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getLocalDbMock, executeMock } = vi.hoisted(() => ({
  getLocalDbMock: vi.fn(),
  executeMock: vi.fn(),
}))

vi.mock('./connection', () => ({ getLocalDb: getLocalDbMock }))

import { withTransaction } from './transaction'

function statements() {
  return executeMock.mock.calls.map(([sql]) => sql as string)
}

describe('withTransaction', () => {
  beforeEach(() => {
    executeMock.mockReset()
    getLocalDbMock.mockReset()
    executeMock.mockResolvedValue({ rowsAffected: 0 })
    getLocalDbMock.mockResolvedValue({ execute: executeMock })
  })

  it('commits when the work resolves', async () => {
    const result = await withTransaction(async () => 'done')

    expect(result).toBe('done')
    expect(statements()).toEqual(['BEGIN IMMEDIATE', 'COMMIT'])
  })

  it('rolls back and rethrows when the work fails', async () => {
    const failure = new Error('constraint violated')

    await expect(withTransaction(async () => { throw failure })).rejects.toBe(failure)
    expect(statements()).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK'])
    expect(statements()).not.toContain('COMMIT')
  })

  it('propagates the original error even if the rollback fails', async () => {
    const failure = new Error('original')
    executeMock.mockImplementation((sql: string) => {
      if (sql === 'ROLLBACK') return Promise.reject(new Error('rollback failed'))
      return Promise.resolve({ rowsAffected: 0 })
    })

    await expect(withTransaction(async () => { throw failure })).rejects.toBe(failure)
  })

  it('serializes overlapping transactions', async () => {
    const order: string[] = []
    let releaseFirst: () => void = () => {}
    const firstStarted = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = withTransaction(async () => {
      order.push('first:start')
      await firstStarted
      order.push('first:end')
    })
    const second = withTransaction(async () => {
      order.push('second:start')
    })

    releaseFirst()
    await Promise.all([first, second])

    expect(order).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('keeps running after a failed transaction', async () => {
    await expect(withTransaction(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(withTransaction(async () => 'ok')).resolves.toBe('ok')
  })
})
