export type WakeLockCapability =
  { readonly supported: true } | { readonly supported: false }

export interface WakeLockSentinelPort {
  readonly released: boolean
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
  removeEventListener(type: 'release', listener: () => void): void
}

export interface WakeLockRequestPort {
  request(type: 'screen'): Promise<WakeLockSentinelPort>
}

export interface ScreenWakeLock {
  readonly capability: WakeLockCapability
  setActive(active: boolean): Promise<void>
  dispose(): Promise<void>
}

export class BrowserScreenWakeLock implements ScreenWakeLock {
  readonly capability: WakeLockCapability
  private desired = false
  private disposed = false
  private generation = 0
  private sentinel: WakeLockSentinelPort | null = null
  private operation: Promise<void> = Promise.resolve()

  constructor(private readonly port: WakeLockRequestPort | null) {
    this.capability = { supported: port !== null }
  }

  setActive(active: boolean): Promise<void> {
    if (this.disposed) return this.operation
    this.desired = active
    const generation = ++this.generation
    return this.enqueue(() => this.synchronize(generation))
  }

  dispose(): Promise<void> {
    if (this.disposed) return this.operation
    this.disposed = true
    this.desired = false
    ++this.generation
    return this.enqueue(() => this.releaseCurrent())
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    this.operation = this.operation.then(operation, operation)
    return this.operation
  }

  private async synchronize(generation: number): Promise<void> {
    if (this.disposed || !this.desired || generation !== this.generation) {
      if (!this.desired || this.disposed) await this.releaseCurrent()
      return
    }
    if (
      this.port === null ||
      (this.sentinel !== null && !this.sentinel.released)
    )
      return

    let candidate: WakeLockSentinelPort
    try {
      candidate = await this.port.request('screen')
    } catch {
      return
    }

    if (this.disposed || !this.desired || generation !== this.generation) {
      await candidate.release().catch(() => undefined)
      return
    }

    this.sentinel = candidate
    candidate.addEventListener('release', this.handleRelease)
  }

  private readonly handleRelease = (): void => {
    const released = this.sentinel
    if (released !== null)
      released.removeEventListener('release', this.handleRelease)
    this.sentinel = null
    if (this.desired && !this.disposed) {
      const generation = this.generation
      void this.enqueue(() => this.synchronize(generation))
    }
  }

  private async releaseCurrent(): Promise<void> {
    const current = this.sentinel
    if (current === null) return
    this.sentinel = null
    current.removeEventListener('release', this.handleRelease)
    if (!current.released) await current.release().catch(() => undefined)
  }
}

export function getBrowserScreenWakeLock(): ScreenWakeLock {
  const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockRequestPort })
    .wakeLock
  return new BrowserScreenWakeLock(wakeLock ?? null)
}
