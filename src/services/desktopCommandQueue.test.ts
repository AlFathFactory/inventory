import { beforeEach, describe, expect, it, vi } from 'vitest'

const isDesktopRuntimeMock = vi.hoisted(() => vi.fn())

vi.mock('../config/platform', () => ({
  isDesktopRuntime: isDesktopRuntimeMock,
}))

import { enqueueCommand } from './desktopCommandQueue'

describe('desktop command queue boundary', () => {
  beforeEach(() => {
    isDesktopRuntimeMock.mockReset()
  })

  it('does not load or use SQLite in the web runtime', async () => {
    isDesktopRuntimeMock.mockReturnValue(false)

    await expect(enqueueCommand({
      commandType: 'inventory_operation',
      contractVersion: 1,
      payload: {},
    })).rejects.toThrow(/only available on desktop/i)
  })
})
