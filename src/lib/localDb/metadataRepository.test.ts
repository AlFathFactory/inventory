import { beforeEach, describe, expect, it, vi } from 'vitest'

const { selectMock, executeMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  executeMock: vi.fn(),
}))

vi.mock('./connection', () => ({
  getLocalDb: vi.fn().mockResolvedValue({ select: selectMock, execute: executeMock }),
}))

import {
  deleteMetadataValues,
  getMetadataValue,
  getMetadataValues,
  setMetadataValue,
  setMetadataValues,
} from './metadataRepository'

describe('metadataRepository', () => {
  beforeEach(() => {
    selectMock.mockReset()
    executeMock.mockReset()
    executeMock.mockResolvedValue({ rowsAffected: 1 })
  })

  it('returns the stored value when the key exists', async () => {
    selectMock.mockResolvedValue([{ key: 'schema_version', value: '2', updated_at: 'now' }])

    expect(await getMetadataValue('schema_version')).toBe('2')
    expect(selectMock).toHaveBeenCalledWith(
      'SELECT key, value, updated_at FROM metadata WHERE key IN ($1)',
      ['schema_version'],
    )
  })

  it('returns null when the key is missing', async () => {
    selectMock.mockResolvedValue([])

    expect(await getMetadataValue('missing')).toBeNull()
  })

  it('reads several keys in one query', async () => {
    selectMock.mockResolvedValue([
      { key: 'a', value: '1', updated_at: 'now' },
      { key: 'b', value: '2', updated_at: 'now' },
    ])

    const values = await getMetadataValues(['a', 'b', 'c'])

    expect(selectMock).toHaveBeenCalledWith(
      'SELECT key, value, updated_at FROM metadata WHERE key IN ($1, $2, $3)',
      ['a', 'b', 'c'],
    )
    expect(values.get('a')).toBe('1')
    expect(values.get('b')).toBe('2')
    expect(values.has('c')).toBe(false)
  })

  it('upserts a single key/value pair', async () => {
    await setMetadataValue('schema_version', '2')

    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(key) DO UPDATE'),
      ['schema_version', '2'],
    )
  })

  it('upserts multiple entries in one statement', async () => {
    await setMetadataValues({ sync_status: 'syncing', last_sync_error: '' })

    const [sql, bindings] = executeMock.mock.calls[0]
    expect(sql).toContain("($1, $2, datetime('now')), ($3, $4, datetime('now'))")
    expect(bindings).toEqual(['sync_status', 'syncing', 'last_sync_error', ''])
    expect(executeMock).toHaveBeenCalledTimes(1)
  })

  it('deletes several keys in one statement', async () => {
    await deleteMetadataValues(['a', 'b'])

    expect(executeMock).toHaveBeenCalledWith(
      'DELETE FROM metadata WHERE key IN ($1, $2)',
      ['a', 'b'],
    )
  })

  it('skips the database entirely for empty inputs', async () => {
    expect((await getMetadataValues([])).size).toBe(0)
    await setMetadataValues({})
    await deleteMetadataValues([])

    expect(selectMock).not.toHaveBeenCalled()
    expect(executeMock).not.toHaveBeenCalled()
  })
})
