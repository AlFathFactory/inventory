export type BuildVersion = { buildId: string }

export function hasNewBuild(currentBuildId: string, version: BuildVersion | null) {
  return Boolean(version?.buildId && version.buildId !== currentBuildId)
}

export async function fetchBuildVersion(
  fetcher: typeof fetch = fetch,
): Promise<BuildVersion | null> {
  try {
    const response = await fetcher('/version.json', { cache: 'no-store' })
    if (!response.ok) return null
    const value = await response.json() as Partial<BuildVersion>
    return typeof value.buildId === 'string' && value.buildId.trim()
      ? { buildId: value.buildId }
      : null
  } catch {
    return null
  }
}
