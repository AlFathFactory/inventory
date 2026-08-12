import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTrailingInvalidation,
  subscribeToInventoryChanges,
  type InventoryRealtimeEvent,
} from './inventoryRealtimeService'

describe('inventory realtime coordination', () => {
  afterEach(() => vi.useRealTimers())

  it('coalesces a burst into one trailing invalidation', () => {
    vi.useFakeTimers()
    const invalidate = vi.fn()
    const scheduler = createTrailingInvalidation(invalidate, 1_000)
    scheduler.queue('inventory:consumables')
    vi.advanceTimersByTime(700)
    scheduler.queue('inventory:consumables')
    scheduler.queue('projects')
    vi.advanceTimersByTime(999)
    expect(invalidate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect([...invalidate.mock.calls[0][0]]).toEqual(['inventory:consumables', 'projects'])
  })

  it('subscribes once and removes the channel during cleanup', () => {
    const callbacks: Array<() => void> = []
    const channel = {
      on: vi.fn((_event: string, _filter: object, callback: () => void) => {
        callbacks.push(callback)
        return channel
      }),
      subscribe: vi.fn(() => channel),
    }
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    }
    const events: InventoryRealtimeEvent[] = []
    const cleanup = subscribeToInventoryChanges((event) => events.push(event), client)
    expect(client.channel).toHaveBeenCalledTimes(1)
    expect(channel.subscribe).toHaveBeenCalledTimes(1)
    callbacks[0]()
    expect(events[0]).toMatchObject({ kind: 'inventory' })
    cleanup()
    expect(client.removeChannel).toHaveBeenCalledWith(channel)
  })

  it('subscribes to inventory_items and categories on the same single channel', () => {
    const filters: Array<{ event: string; schema: string; table: string }> = []
    const channel = {
      on: vi.fn((_event: string, filter: { event: string; schema: string; table: string }, _callback: () => void) => {
        filters.push(filter)
        return channel
      }),
      subscribe: vi.fn(() => channel),
    }
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    }
    subscribeToInventoryChanges(() => undefined, client)
    expect(client.channel).toHaveBeenCalledTimes(1)
    expect(filters.some((filter) => filter.table === 'inventory_items')).toBe(true)
    expect(filters.some((filter) => filter.table === 'categories')).toBe(true)
  })

  it('emits a dynamic-inventory event for inventory_items and categories changes', () => {
    const callbacksByTable = new Map<string, () => void>()
    const channel = {
      on: vi.fn((_event: string, filter: { table: string }, callback: () => void) => {
        callbacksByTable.set(filter.table, callback)
        return channel
      }),
      subscribe: vi.fn(() => channel),
    }
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    }
    const events: InventoryRealtimeEvent[] = []
    subscribeToInventoryChanges((event) => events.push(event), client)
    callbacksByTable.get('inventory_items')?.()
    callbacksByTable.get('categories')?.()
    expect(events).toEqual([{ kind: 'dynamic-inventory' }, { kind: 'dynamic-inventory' }])
  })
})
