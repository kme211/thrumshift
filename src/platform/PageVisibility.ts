import type { MonotonicClock } from './Clock'

export type PageVisibilityState = 'visible' | 'hidden'

export interface PageVisibilityChange {
  readonly state: PageVisibilityState
  readonly occurredAt: number
}

export interface PageVisibility {
  getState(): PageVisibilityState
  subscribe(listener: (change: PageVisibilityChange) => void): () => void
}

export interface VisibilityDocumentPort {
  readonly visibilityState?: string
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export class BrowserPageVisibility implements PageVisibility {
  constructor(
    private readonly documentPort: VisibilityDocumentPort | null,
    private readonly clock: MonotonicClock,
  ) {}

  getState(): PageVisibilityState {
    return this.documentPort?.visibilityState === 'hidden'
      ? 'hidden'
      : 'visible'
  }

  subscribe(listener: (change: PageVisibilityChange) => void): () => void {
    if (this.documentPort?.visibilityState === undefined) return () => undefined
    const handleChange = () =>
      listener({ state: this.getState(), occurredAt: this.clock.now() })
    this.documentPort.addEventListener('visibilitychange', handleChange)
    return () =>
      this.documentPort?.removeEventListener('visibilitychange', handleChange)
  }
}

export function getBrowserPageVisibility(
  clock: MonotonicClock,
): PageVisibility {
  return new BrowserPageVisibility(
    typeof document === 'undefined' ? null : document,
    clock,
  )
}
