import { isDesktopRuntime } from '../config/platform'

/**
 * Picks the read source for the current runtime.
 *
 * Consumers declare both paths and stay platform-agnostic; this is the only
 * place (besides the resolver) that inspects the runtime, so no page, hook
 * or component branches on platform itself.
 *
 * Desktop deliberately has no fallback: if the local database is empty or
 * unreadable, that result is surfaced as-is rather than quietly reaching for
 * the browser cache or Supabase.
 */
export async function readForRuntime<T>(sources: {
  desktop: () => Promise<T>
  web: () => Promise<T>
}): Promise<T> {
  return isDesktopRuntime() ? sources.desktop() : sources.web()
}
