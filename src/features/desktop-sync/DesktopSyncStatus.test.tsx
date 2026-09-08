import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DesktopSyncStatus } from './DesktopSyncStatus'

const mocks = vi.hoisted(() => ({
  sync: {
    isEnabled: true,
    phase: 'idle' as const,
    isSyncing: false,
    lastSuccessfulSyncAt: null,
    lastError: null,
    refresh: vi.fn(async () => undefined),
  },
  connectivity: {
    isEnabled: true,
    state: 'online' as 'online' | 'offline' | 'checking',
    lastCheckedAt: '2026-09-08T10:00:00.000Z',
    initialized: true,
  },
}))

vi.mock('./useDesktopSync', () => ({
  useDesktopSync: () => mocks.sync,
}))

vi.mock('./useDesktopConnectivity', () => ({
  useDesktopConnectivity: () => mocks.connectivity,
}))

describe('DesktopSyncStatus connectivity rendering', () => {
  beforeEach(() => {
    mocks.sync.isEnabled = true
    mocks.connectivity.state = 'online'
  })

  it('shows confirmed online state in the existing desktop sync area', () => {
    expect(renderToStaticMarkup(<DesktopSyncStatus />)).toContain('متصل')
  })

  it('shows confirmed offline state in the existing desktop sync area', () => {
    mocks.connectivity.state = 'offline'

    expect(renderToStaticMarkup(<DesktopSyncStatus />)).toContain('غير متصل')
  })

  it('renders nothing on web', () => {
    mocks.sync.isEnabled = false

    expect(renderToStaticMarkup(<DesktopSyncStatus />)).toBe('')
  })
})
