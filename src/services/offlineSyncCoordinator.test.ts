import { beforeEach, describe, expect, it, vi } from 'vitest'

const { syncOfflineData } = vi.hoisted(() => ({
  syncOfflineData: vi.fn<() => Promise<void>>(),
}))

vi.mock('./syncService', () => ({ syncOfflineData }))

import { runOfflineSyncOnce } from './offlineSyncCoordinator'

describe('runOfflineSyncOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: undefined } })
    syncOfflineData.mockResolvedValue()
  })

  it('returns one promise for repeated manual and automatic requests', async () => {
    let release!: () => void
    syncOfflineData.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))
    const manual = runOfflineSyncOnce()
    const repeatedClick = runOfflineSyncOnce()
    const automatic = runOfflineSyncOnce()
    expect(repeatedClick).toBe(manual)
    expect(automatic).toBe(manual)
    expect(syncOfflineData).toHaveBeenCalledTimes(1)
    release()
    await manual
  })

  it('does not redownload the complete snapshot after upload', async () => {
    await runOfflineSyncOnce()
    expect(syncOfflineData).toHaveBeenCalledTimes(1)
  })

  it('uses the cross-tab Web Lock when available', async () => {
    const request = vi.fn(async (_name: string, callback: () => Promise<void>) => callback())
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request } } })
    await runOfflineSyncOnce()
    expect(request).toHaveBeenCalledWith('inventory-offline-sync', expect.any(Function))
    expect(syncOfflineData).toHaveBeenCalledTimes(1)
  })
})
