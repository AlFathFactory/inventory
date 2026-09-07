import { isTauri } from '@tauri-apps/api/core'

export type Runtime = 'web' | 'desktop'

/**
 * Single source of truth for "are we inside the Tauri desktop shell?".
 * Every other module should branch on this instead of touching
 * `@tauri-apps/api` or `window.__TAURI__` directly, so the detection
 * strategy can change in one place if Tauri's API ever does.
 */
export function getRuntime(): Runtime {
  return isTauri() ? 'desktop' : 'web'
}

export function isDesktopRuntime(): boolean {
  return getRuntime() === 'desktop'
}

export function isWebRuntime(): boolean {
  return getRuntime() === 'web'
}
