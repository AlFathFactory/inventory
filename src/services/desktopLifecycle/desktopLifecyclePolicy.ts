/**
 * Centralized, typed policy for desktop lifecycle-triggered sync.
 *
 * Startup, reconnect and manual refresh remain the primary sync triggers —
 * none of them are gated by this. This constant only bounds how often the
 * *automatic* pass fired when the window regains focus/visibility can
 * repeat, so alt-tabbing back and forth (or the connectivity service's own
 * while-visible freshness check) can never turn into repeated sync traffic.
 */
export const MIN_AUTOMATIC_SYNC_INTERVAL_MS = 120_000

/** Why an automatic lifecycle pass did or did not run. */
export type DesktopLifecycleSkipReason = 'web' | 'hidden' | 'offline' | 'throttled'
