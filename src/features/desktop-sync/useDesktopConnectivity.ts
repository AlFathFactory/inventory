import { useSyncExternalStore } from 'react'
import { isDesktopRuntime } from '../../config/platform'
import {
  getDesktopConnectivitySnapshot,
  subscribeToDesktopConnectivity,
} from '../../services/desktopConnectivity/desktopConnectivityStore'

/** Presentation-facing access to connectivity state; monitoring lives in the service. */
export function useDesktopConnectivity() {
  const snapshot = useSyncExternalStore(
    subscribeToDesktopConnectivity,
    getDesktopConnectivitySnapshot,
    getDesktopConnectivitySnapshot,
  )

  return {
    isEnabled: isDesktopRuntime(),
    ...snapshot,
  }
}
