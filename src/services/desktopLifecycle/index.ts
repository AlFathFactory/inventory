export {
  createDesktopLifecycleService,
  startDesktopLifecycle,
  stopDesktopLifecycle,
  runDesktopLifecycleAutomaticPass,
  isDesktopLifecycleAutomaticPassRunning,
} from './desktopLifecycleService'
export type {
  DesktopLifecycleAutoPassOutcome,
  DesktopLifecycleDependencies,
} from './desktopLifecycleService'
export {
  MIN_AUTOMATIC_SYNC_INTERVAL_MS,
} from './desktopLifecyclePolicy'
export type { DesktopLifecycleSkipReason } from './desktopLifecyclePolicy'
