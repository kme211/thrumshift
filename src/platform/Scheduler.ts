import type { MonotonicClock } from './Clock'

export type CancelScheduledWakeup = () => void

export interface Scheduler {
  schedule(
    delayMs: number,
    onWake: (occurredAt: number) => void,
  ): CancelScheduledWakeup
  cancelAll(): void
}

export interface TimerPort {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

export class BrowserScheduler implements Scheduler {
  private readonly handles = new Map<unknown, () => void>()

  constructor(
    private readonly clock: MonotonicClock,
    private readonly timers: TimerPort,
  ) {}

  schedule(
    delayMs: number,
    onWake: (occurredAt: number) => void,
  ): CancelScheduledWakeup {
    let active = true
    const handle = this.timers.setTimeout(
      () => {
        if (!active) return
        active = false
        this.handles.delete(handle)
        onWake(this.clock.now())
      },
      Math.max(0, delayMs),
    )
    this.handles.set(handle, () => {
      active = false
    })

    return () => {
      if (!active) return
      active = false
      this.handles.delete(handle)
      this.timers.clearTimeout(handle)
    }
  }

  cancelAll(): void {
    for (const [handle, deactivate] of this.handles) {
      deactivate()
      this.timers.clearTimeout(handle)
    }
    this.handles.clear()
  }
}

export function getBrowserTimerPort(): TimerPort {
  return {
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  }
}
