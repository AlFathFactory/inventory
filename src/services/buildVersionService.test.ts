import { describe, expect, it, vi } from 'vitest'
import { fetchBuildVersion, hasNewBuild } from './buildVersionService'

describe('build version checks', () => {
  it('detects a different build and ignores the current build', () => {
    expect(hasNewBuild('build-a', { buildId: 'build-b' })).toBe(true)
    expect(hasNewBuild('build-a', { buildId: 'build-a' })).toBe(false)
    expect(hasNewBuild('build-a', null)).toBe(false)
  })

  it('returns null when the version request fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('network'))
    await expect(fetchBuildVersion(fetcher)).resolves.toBeNull()
  })

  it('requests version.json without using the browser cache', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ buildId: 'build-b' }),
      { status: 200 },
    ))
    await expect(fetchBuildVersion(fetcher)).resolves.toEqual({ buildId: 'build-b' })
    expect(fetcher).toHaveBeenCalledWith('/version.json', { cache: 'no-store' })
  })
})
