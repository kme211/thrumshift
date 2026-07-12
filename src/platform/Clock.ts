export interface MonotonicClock {
  now(): number
}

export interface PerformanceClockPort {
  now(): number
}

export class BrowserMonotonicClock implements MonotonicClock {
  constructor(private readonly performancePort: PerformanceClockPort) {}

  now(): number {
    return this.performancePort.now()
  }
}

export function getBrowserMonotonicClock(): MonotonicClock {
  return new BrowserMonotonicClock(performance)
}
