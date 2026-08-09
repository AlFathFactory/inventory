import { supabaseClient } from '../lib/supabaseClient'

export type ConnectionState = 'online' | 'offline' | 'checking' | 'server_unreachable'

let activeProbe: Promise<boolean> | null = null
let lastProbeAt = 0
let lastProbeResult = false

export function isTransportError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : ''
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|abort|timeout|offline/i.test(message)
}

async function runProbe(timeoutMs: number) {
  if (!supabaseClient) return false
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const { error } = await supabaseClient
      .from('projects')
      .select('id')
      .limit(1)
      .abortSignal(controller.signal)
    return !error || !isTransportError(error)
  } catch (error) {
    return !isTransportError(error)
  } finally {
    window.clearTimeout(timeout)
  }
}

export function probeSupabaseReachability(options: { force?: boolean; timeoutMs?: number } = {}) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.resolve(false)
  const now = Date.now()
  if (!options.force && now - lastProbeAt < 15_000) return Promise.resolve(lastProbeResult)
  if (activeProbe) return activeProbe
  activeProbe = runProbe(options.timeoutMs ?? 8_000)
    .then((result) => {
      lastProbeAt = Date.now()
      lastProbeResult = result
      return result
    })
    .finally(() => { activeProbe = null })
  return activeProbe
}

export async function requireSupabaseReachability() {
  if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت')
  if (!await probeSupabaseReachability({ force: true })) {
    throw new Error('تعذر الوصول إلى الخادم. تحقق من الاتصال ثم أعد المحاولة.')
  }
}
