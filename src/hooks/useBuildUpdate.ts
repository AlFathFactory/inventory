import { useCallback, useEffect, useState } from 'react'
import { fetchBuildVersion, hasNewBuild } from '../services/buildVersionService'

export function useBuildUpdate() {
  const [newBuildId, setNewBuildId] = useState<string | null>(null)

  const checkForUpdate = useCallback(async () => {
    if (!navigator.onLine) return
    const version = await fetchBuildVersion()
    if (hasNewBuild(__BUILD_ID__, version)) setNewBuildId(version!.buildId)
  }, [])

  useEffect(() => {
    const handleOnline = () => { void checkForUpdate() }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)
    const initial = window.setTimeout(() => { void checkForUpdate() }, 5_000)
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }, 60_000)
    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.clearTimeout(initial)
      window.clearInterval(interval)
    }
  }, [checkForUpdate])

  return { updateAvailable: Boolean(newBuildId), newBuildId, checkForUpdate }
}
