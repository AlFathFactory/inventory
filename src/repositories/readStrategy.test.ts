import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config/platform', () => ({ isDesktopRuntime: vi.fn() }))

import { isDesktopRuntime } from '../config/platform'
import { readForRuntime } from './readStrategy'

describe('readForRuntime', () => {
  const desktop = vi.fn()
  const web = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    desktop.mockResolvedValue('desktop-data')
    web.mockResolvedValue('web-data')
  })

  it('uses the desktop source and never the web one on desktop', async () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(true)

    expect(await readForRuntime({ desktop, web })).toBe('desktop-data')
    expect(web).not.toHaveBeenCalled()
  })

  it('uses the web source and never the desktop one on web', async () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(false)

    expect(await readForRuntime({ desktop, web })).toBe('web-data')
    expect(desktop).not.toHaveBeenCalled()
  })

  it('propagates a desktop failure instead of falling back to web', async () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(true)
    desktop.mockRejectedValue(new Error('database is locked'))

    await expect(readForRuntime({ desktop, web })).rejects.toThrow('database is locked')
    expect(web).not.toHaveBeenCalled()
  })
})
