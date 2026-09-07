import { beforeEach, describe, expect, it, vi } from 'vitest'

const { isDesktopRuntimeMock, getLocalDbMock, setMetadataValueMock } = vi.hoisted(() => ({
  isDesktopRuntimeMock: vi.fn(),
  getLocalDbMock: vi.fn(),
  setMetadataValueMock: vi.fn(),
}))

vi.mock('../../config/platform', () => ({
  isDesktopRuntime: isDesktopRuntimeMock,
}))
vi.mock('./connection', () => ({
  getLocalDb: getLocalDbMock,
}))
vi.mock('./metadataRepository', () => ({
  setMetadataValue: setMetadataValueMock,
}))

import { initializeLocalDb } from './initialize'

describe('initializeLocalDb', () => {
  beforeEach(() => {
    isDesktopRuntimeMock.mockReset()
    getLocalDbMock.mockReset()
    setMetadataValueMock.mockReset()
  })

  it('does nothing on the web runtime', async () => {
    isDesktopRuntimeMock.mockReturnValue(false)

    await initializeLocalDb()

    expect(getLocalDbMock).not.toHaveBeenCalled()
    expect(setMetadataValueMock).not.toHaveBeenCalled()
  })

  it('opens the database and stamps the schema version on desktop', async () => {
    isDesktopRuntimeMock.mockReturnValue(true)
    getLocalDbMock.mockResolvedValue({})

    await initializeLocalDb()

    expect(getLocalDbMock).toHaveBeenCalledTimes(1)
    expect(setMetadataValueMock).toHaveBeenCalledWith('schema_version', '1')
  })
})
