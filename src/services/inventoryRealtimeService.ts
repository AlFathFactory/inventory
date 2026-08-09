import { categoryEntries } from '../config/categoryConfig'
import { supabaseClient } from '../lib/supabaseClient'

export type InventoryRealtimeEvent =
  | { kind: 'inventory'; tableName: string }
  | { kind: 'projects' }
  | { kind: 'imports' }

type RealtimeChannelLike = {
  on: (
    event: string,
    filter: { event: string; schema: string; table: string },
    callback: () => void,
  ) => RealtimeChannelLike
  subscribe: () => RealtimeChannelLike
}

type RealtimeClientLike = {
  channel: (name: string) => RealtimeChannelLike
  removeChannel: (channel: RealtimeChannelLike) => unknown
}

export function createTrailingInvalidation(
  invalidate: (eventKeys: Set<string>) => void,
  delayMs = 1_000,
) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const queued = new Set<string>()

  function flush() {
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (queued.size === 0) return
    const eventKeys = new Set(queued)
    queued.clear()
    invalidate(eventKeys)
  }

  return {
    queue(eventKey: string) {
      queued.add(eventKey)
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(flush, delayMs)
    },
    flush,
    dispose() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      queued.clear()
    },
  }
}

export function subscribeToInventoryChanges(
  onEvent: (event: InventoryRealtimeEvent) => void,
  clientOverride?: RealtimeClientLike,
) {
  const client = clientOverride ?? supabaseClient as unknown as RealtimeClientLike | null
  if (!client) return () => undefined

  let channel = client.channel('inventory-application-changes')
  for (const [, category] of categoryEntries) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: category.table },
      () => onEvent({ kind: 'inventory', tableName: category.table }),
    )
  }
  channel = channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'projects' },
      () => onEvent({ kind: 'projects' }),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'imports' },
      () => onEvent({ kind: 'imports' }),
    )
    .subscribe()

  return () => { void client.removeChannel(channel) }
}
