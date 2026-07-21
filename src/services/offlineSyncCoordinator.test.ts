import { beforeEach, describe, expect, it, vi } from 'vitest'

const { syncOfflineData, prepareOfflineData } = vi.hoisted(() => ({
  syncOfflineData: vi.fn<() => Promise<void>>(),
  prepareOfflineData: vi.fn<() => Promise<void>>(),
}))

vi.mock('./syncService', () => ({ syncOfflineData }))
vi.mock('./offlineBootstrapService', () => ({ prepareOfflineData }))

import { runOfflineSyncOnce } from './offlineSyncCoordinator'

describe('runOfflineSyncOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: undefined } })
    syncOfflineData.mockResolvedValue()
    prepareOfflineData.mockResolvedValue()
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
    expect(prepareOfflineData).toHaveBeenCalledTimes(1)
  })

  it('never prepares the cache before operation sync finishes', async () => {
    const order: string[] = []
    syncOfflineData.mockImplementation(async () => { order.push('sync') })
    prepareOfflineData.mockImplementation(async () => { order.push('prepare') })
    await runOfflineSyncOnce()
    expect(order).toEqual(['sync', 'prepare'])
  })

  it('uses the cross-tab Web Lock when available', async () => {
    const request = vi.fn(async (_name: string, callback: () => Promise<void>) => callback())
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request } } })
    await runOfflineSyncOnce()
    expect(request).toHaveBeenCalledWith('inventory-offline-sync', expect.any(Function))
    expect(syncOfflineData).toHaveBeenCalledTimes(1)
  })
})
