import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  isDesktopRuntimeMock,
  getMetadataValuesMock,
  setMetadataValuesMock,
  deleteMetadataValuesMock,
} = vi.hoisted(() => ({
  isDesktopRuntimeMock: vi.fn(),
  getMetadataValuesMock: vi.fn(),
  setMetadataValuesMock: vi.fn(),
  deleteMetadataValuesMock: vi.fn(),
}))

vi.mock('../../config/platform', () => ({
  isDesktopRuntime: isDesktopRuntimeMock,
}))
vi.mock('./metadataRepository', () => ({
  getMetadataValues: getMetadataValuesMock,
  setMetadataValues: setMetadataValuesMock,
  deleteMetadataValues: deleteMetadataValuesMock,
}))

import {
  clearSyncState,
  getSyncState,
  markSyncFailed,
  markSyncStarted,
  markSyncSucceeded,
} from './syncState'

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function lastWrite() {
  return setMetadataValuesMock.mock.calls.at(-1)?.[0] as Record<string, string>
}

describe('syncState', () => {
  beforeEach(() => {
    isDesktopRuntimeMock.mockReset()
    getMetadataValuesMock.mockReset()
    setMetadataValuesMock.mockReset()
    deleteMetadataValuesMock.mockReset()
    isDesktopRuntimeMock.mockReturnValue(true)
    getMetadataValuesMock.mockResolvedValue(new Map())
    setMetadataValuesMock.mockResolvedValue(undefined)
    deleteMetadataValuesMock.mockResolvedValue(undefined)
  })

  it('returns the default state for a fresh database', async () => {
    expect(await getSyncState()).toEqual({
      schemaVersion: null,
      status: 'idle',
      cursor: null,
      lastSuccessfulSyncAt: null,
      lastSyncStartedAt: null,
      lastError: null,
    })
  })

  it('reads a populated state and falls back to idle for an unknown status', async () => {
    getMetadataValuesMock.mockResolvedValue(new Map([
      ['schema_version', '2'],
      ['sync_status', 'nonsense'],
      ['last_sync_cursor', '2026-09-07T00:00:00.000Z'],
      ['last_successful_sync_at', '2026-09-07T00:00:01.000Z'],
      ['last_sync_started_at', '2026-09-07T00:00:00.500Z'],
      ['last_sync_error', ''],
    ]))

    expect(await getSyncState()).toEqual({
      schemaVersion: '2',
      status: 'idle',
      cursor: '2026-09-07T00:00:00.000Z',
      lastSuccessfulSyncAt: '2026-09-07T00:00:01.000Z',
      lastSyncStartedAt: '2026-09-07T00:00:00.500Z',
      lastError: null,
    })
  })

  it('marks a started run in flight and clears the previous error', async () => {
    await markSyncStarted()

    const written = lastWrite()
    expect(written.sync_status).toBe('syncing')
    expect(written.last_sync_started_at).toMatch(ISO_PATTERN)
    expect(written.last_sync_error).toBe('')
    expect(written).not.toHaveProperty('last_sync_cursor')
  })

  it('advances the cursor only on success, in a single atomic write', async () => {
    await markSyncStarted()
    await markSyncSucceeded('cursor-42')

    expect(setMetadataValuesMock).toHaveBeenCalledTimes(2)
    const written = lastWrite()
    expect(written.sync_status).toBe('succeeded')
    expect(written.last_sync_cursor).toBe('cursor-42')
    expect(written.last_successful_sync_at).toMatch(ISO_PATTERN)
    expect(written.last_sync_error).toBe('')
  })

  it('records a failure without touching the cursor', async () => {
    await markSyncStarted()
    await markSyncFailed(new Error('network down'))

    const written = lastWrite()
    expect(written.sync_status).toBe('failed')
    expect(written.last_sync_error).toBe('network down')
    expect(written).not.toHaveProperty('last_sync_cursor')
    expect(written).not.toHaveProperty('last_successful_sync_at')
  })

  it('preserves the previous successful cursor across a later failure', async () => {
    await markSyncSucceeded('cursor-1')
    await markSyncFailed('boom')

    const cursorWrites = setMetadataValuesMock.mock.calls
      .map(([entries]: [Record<string, string>]) => entries.last_sync_cursor)
      .filter((cursor: string | undefined) => cursor !== undefined)

    expect(cursorWrites).toEqual(['cursor-1'])
  })

  it('serializes non-Error failures', async () => {
    await markSyncFailed({ code: 500 })

    expect(lastWrite().last_sync_error).toBe('{"code":500}')
  })

  it('clears only sync keys and leaves schema_version intact', async () => {
    await clearSyncState()

    expect(deleteMetadataValuesMock).toHaveBeenCalledWith([
      'last_sync_cursor',
      'last_successful_sync_at',
      'last_sync_started_at',
      'sync_status',
      'last_sync_error',
    ])
    expect(deleteMetadataValuesMock.mock.calls[0][0]).not.toContain('schema_version')
  })

  describe('on the web runtime', () => {
    beforeEach(() => {
      isDesktopRuntimeMock.mockReturnValue(false)
    })

    it('returns the default state without touching the database', async () => {
      expect(await getSyncState()).toEqual({
        schemaVersion: null,
        status: 'idle',
        cursor: null,
        lastSuccessfulSyncAt: null,
        lastSyncStartedAt: null,
        lastError: null,
      })
      expect(getMetadataValuesMock).not.toHaveBeenCalled()
    })

    it('makes every mutation a no-op', async () => {
      await markSyncStarted()
      await markSyncSucceeded('cursor-1')
      await markSyncFailed('boom')
      await clearSyncState()

      expect(setMetadataValuesMock).not.toHaveBeenCalled()
      expect(deleteMetadataValuesMock).not.toHaveBeenCalled()
    })
  })
})
