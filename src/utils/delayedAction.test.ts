import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDelayedAction } from './delayedAction'

describe('createDelayedAction', () => {
  afterEach(() => vi.useRealTimers())

  it('does not run when a short hover is cancelled', () => {
    vi.useFakeTimers()
    const action = vi.fn()
    const delayed = createDelayedAction(action, 250)
    delayed.schedule('row-1')
    vi.advanceTimersByTime(100)
    delayed.cancel()
    vi.advanceTimersByTime(200)
    expect(action).not.toHaveBeenCalled()
  })

  it('runs after a deliberate hover and immediately for keyboard focus', () => {
    vi.useFakeTimers()
    const action = vi.fn()
    const delayed = createDelayedAction(action, 250)
    delayed.schedule('row-1')
    vi.advanceTimersByTime(250)
    expect(action).toHaveBeenCalledWith('row-1')
    delayed.runNow('row-2')
    expect(action).toHaveBeenLastCalledWith('row-2')
  })
})
