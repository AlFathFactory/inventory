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
})
