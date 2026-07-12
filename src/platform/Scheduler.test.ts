import { describe, expect, it, vi } from 'vitest'

import { BrowserScheduler, type TimerPort } from './Scheduler'

function createTimers() {
  let nextHandle = 0
  const callbacks = new Map<number, () => void>()
  const timers: TimerPort = {
    setTimeout(callback) {
      const handle = ++nextHandle
      callbacks.set(handle, callback)
      return handle
    },
    clearTimeout(handle) {
      callbacks.delete(handle as number)
    },
  }
  return { callbacks, timers }
}

describe('BrowserScheduler', () => {
  it('uses callback time as occurrence truth rather than the requested delay', () => {
    const { callbacks, timers } = createTimers()
    let now = 10
    const scheduler = new BrowserScheduler({ now: () => now }, timers)
    const onWake = vi.fn()

    scheduler.schedule(1_000, onWake)
    now = 4_500
    callbacks.get(1)?.()

    expect(onWake).toHaveBeenCalledWith(4_500)
  })

  it('cancels individual and all pending wakeups idempotently', () => {
    const { callbacks, timers } = createTimers()
    const queuedCallbacks: (() => void)[] = []
    const originalClearTimeout = timers.clearTimeout
    timers.clearTimeout = (handle) => {
      const callback = callbacks.get(handle as number)
      if (callback !== undefined) queuedCallbacks.push(callback)
      originalClearTimeout(handle)
    }
    const scheduler = new BrowserScheduler({ now: () => 1 }, timers)
    const first = vi.fn()
    const second = vi.fn()
    const cancelFirst = scheduler.schedule(10, first)
    scheduler.schedule(20, second)

    cancelFirst()
    cancelFirst()
    expect(callbacks.has(1)).toBe(false)
    scheduler.cancelAll()
    expect(callbacks.size).toBe(0)
    for (const callback of queuedCallbacks) callback()
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
  })

  it('normalizes negative delays to zero', () => {
    const setTimeout = vi.fn(() => 1)
    const scheduler = new BrowserScheduler(
      { now: () => 0 },
      { setTimeout, clearTimeout: vi.fn() },
    )
    scheduler.schedule(-1, vi.fn())
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 0)
  })
})
