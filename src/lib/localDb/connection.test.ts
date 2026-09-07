import { afterEach, describe, expect, it, vi } from 'vitest'

const loadMock = vi.fn()

vi.mock('../../config/platform', () => ({
  isDesktopRuntime: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: loadMock },
}))

describe('getLocalDb', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('throws on the web runtime without touching the SQL plugin', async () => {
    const { isDesktopRuntime } = await import('../../config/platform')
    vi.mocked(isDesktopRuntime).mockReturnValue(false)

    const { getLocalDb } = await import('./connection')

    await expect(getLocalDb()).rejects.toThrow(/desktop runtime/i)
    expect(loadMock).not.toHaveBeenCalled()
  })

  it('loads the database once and reuses the connection on the desktop runtime', async () => {
    const { isDesktopRuntime } = await import('../../config/platform')
    vi.mocked(isDesktopRuntime).mockReturnValue(true)
    const fakeDb = { select: vi.fn(), execute: vi.fn() }
    loadMock.mockResolvedValue(fakeDb)

    const { getLocalDb } = await import('./connection')

    const [first, second] = await Promise.all([getLocalDb(), getLocalDb()])

    expect(first).toBe(fakeDb)
    expect(second).toBe(fakeDb)
    expect(loadMock).toHaveBeenCalledTimes(1)
    expect(loadMock).toHaveBeenCalledWith('sqlite:inventory.db')
  })
})
