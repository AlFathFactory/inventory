import { useCallback, useEffect, useState } from 'react'
import { probeSupabaseReachability, type ConnectionState } from '../services/connectivityService'

function getInitialState(): ConnectionState {
  if (typeof navigator === 'undefined') return 'online'
  return navigator.onLine ? 'checking' : 'offline'
}

export function useNetworkStatus() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(getInitialState)

  const checkConnection = useCallback(async (force = false) => {
    if (!navigator.onLine) {
      setConnectionState('offline')
      return false
    }
    setConnectionState('checking')
    const reachable = await probeSupabaseReachability({ force })
    setConnectionState(reachable ? 'online' : 'server_unreachable')
    return reachable
  }, [])

  useEffect(() => {
    let active = true
    const check = async (force = false) => {
      const reachable = await probeSupabaseReachability({ force })
      if (active) setConnectionState(navigator.onLine
        ? reachable ? 'online' : 'server_unreachable'
        : 'offline')
    }
    const handleOnline = () => { setConnectionState('checking'); void check(true) }
    const handleOffline = () => setConnectionState('offline')
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void check()
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibility)
    if (navigator.onLine) void check()
    const interval = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') void check()
    }, 60_000)
    return () => {
      active = false
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.clearInterval(interval)
    }
  }, [])

  return {
    isOnline: connectionState === 'online',
    isBrowserOnline: connectionState !== 'offline',
    connectionState,
    checkConnection,
  }
}
