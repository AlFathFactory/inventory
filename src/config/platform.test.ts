import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(),
}))

describe('platform', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('reports the web runtime when not running inside Tauri', async () => {
    const { isTauri } = await import('@tauri-apps/api/core')
    vi.mocked(isTauri).mockReturnValue(false)

    const { getRuntime, isDesktopRuntime, isWebRuntime } = await import('./platform')

    expect(getRuntime()).toBe('web')
    expect(isDesktopRuntime()).toBe(false)
    expect(isWebRuntime()).toBe(true)
  })

  it('reports the desktop runtime when running inside Tauri', async () => {
    const { isTauri } = await import('@tauri-apps/api/core')
    vi.mocked(isTauri).mockReturnValue(true)

    const { getRuntime, isDesktopRuntime, isWebRuntime } = await import('./platform')

    expect(getRuntime()).toBe('desktop')
    expect(isDesktopRuntime()).toBe(true)
    expect(isWebRuntime()).toBe(false)
  })
})
