import { beforeEach, describe, expect, it, vi } from 'vitest'

const { selectMock, executeMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  executeMock: vi.fn(),
}))

vi.mock('./connection', () => ({
  getLocalDb: vi.fn().mockResolvedValue({ select: selectMock, execute: executeMock }),
}))

import { getMetadataValue, setMetadataValue } from './metadataRepository'

describe('metadataRepository', () => {
  beforeEach(() => {
    selectMock.mockReset()
    executeMock.mockReset()
  })

  it('returns the stored value when the key exists', async () => {
    selectMock.mockResolvedValue([{ key: 'schema_version', value: '1', updated_at: 'now' }])

    const value = await getMetadataValue('schema_version')

    expect(value).toBe('1')
    expect(selectMock).toHaveBeenCalledWith(
      'SELECT key, value, updated_at FROM metadata WHERE key = $1',
      ['schema_version'],
    )
  })

  it('returns null when the key is missing', async () => {
    selectMock.mockResolvedValue([])

    const value = await getMetadataValue('missing')

    expect(value).toBeNull()
  })

  it('upserts the key/value pair', async () => {
    executeMock.mockResolvedValue({ rowsAffected: 1 })

    await setMetadataValue('schema_version', '1')

    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO metadata'),
      ['schema_version', '1'],
    )
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(key) DO UPDATE'),
      ['schema_version', '1'],
    )
  })
})
