export {
  CONNECTIVITY_PROBE_TIMEOUT_MS,
  CONNECTIVITY_RECHECK_DEBOUNCE_MS,
  CONNECTIVITY_VISIBLE_INTERVAL_MS,
  createDesktopConnectivityService,
  recheckDesktopConnectivity,
  startDesktopConnectivity,
  stopDesktopConnectivity,
} from './desktopConnectivityService'
export type { DesktopConnectivityDependencies } from './desktopConnectivityService'
export {
  getDesktopConnectivitySnapshot,
  subscribeToDesktopConnectivity,
} from './desktopConnectivityStore'
export type {
  DesktopConnectivitySnapshot,
  DesktopConnectivityState,
} from './desktopConnectivityStore'
