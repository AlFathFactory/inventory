import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDesktopSyncSnapshot,
  resetDesktopSyncSnapshot,
  setDesktopSyncSnapshot,
  subscribeToDesktopSync,
} from './syncStatusStore'

describe('desktop sync status store', () => {
  beforeEach(() => resetDesktopSyncSnapshot())

  it('starts idle and unhydrated', () => {
    expect(getDesktopSyncSnapshot()).toEqual({
      phase: 'idle',
      lastSuccessfulSyncAt: null,
      lastError: null,
      hydrated: false,
    })
  })

  it('notifies subscribers when the snapshot changes', () => {
    const listener = vi.fn()
    subscribeToDesktopSync(listener)

    setDesktopSyncSnapshot({ phase: 'syncing' })

    expect(listener).toHaveBeenCalledOnce()
    expect(getDesktopSyncSnapshot().phase).toBe('syncing')
  })

  it('keeps a stable identity for no-op updates, so nothing re-renders', () => {
    const listener = vi.fn()
    subscribeToDesktopSync(listener)
    const before = getDesktopSyncSnapshot()

    setDesktopSyncSnapshot({ phase: 'idle' })

    expect(listener).not.toHaveBeenCalled()
    expect(getDesktopSyncSnapshot()).toBe(before)
  })

  it('returns a new object when something changed', () => {
    const before = getDesktopSyncSnapshot()

    setDesktopSyncSnapshot({ phase: 'failed', lastError: 'boom' })

    expect(getDesktopSyncSnapshot()).not.toBe(before)
    expect(getDesktopSyncSnapshot()).toMatchObject({ phase: 'failed', lastError: 'boom' })
  })

  it('preserves fields that were not patched', () => {
    setDesktopSyncSnapshot({ lastSuccessfulSyncAt: '2026-09-05T00:00:00Z' })
    setDesktopSyncSnapshot({ phase: 'failed', lastError: 'offline' })

    expect(getDesktopSyncSnapshot()).toMatchObject({
      phase: 'failed',
      lastError: 'offline',
      lastSuccessfulSyncAt: '2026-09-05T00:00:00Z',
    })
  })

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToDesktopSync(listener)

    unsubscribe()
    setDesktopSyncSnapshot({ phase: 'syncing' })

    expect(listener).not.toHaveBeenCalled()
  })
})
