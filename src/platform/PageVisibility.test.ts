import { describe, expect, it, vi } from 'vitest'

import {
  BrowserPageVisibility,
  type VisibilityDocumentPort,
} from './PageVisibility'

describe('BrowserPageVisibility', () => {
  it('reports timestamped visibility changes and removes its listener', () => {
    let listener: (() => void) | undefined
    const port: VisibilityDocumentPort = {
      visibilityState: 'visible',
      addEventListener: (_type, next) => {
        listener = next
      },
      removeEventListener: vi.fn(),
    }
    let now = 20
    const visibility = new BrowserPageVisibility(port, { now: () => now })
    const onChange = vi.fn()
    const unsubscribe = visibility.subscribe(onChange)

    Object.defineProperty(port, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    now = 25
    listener?.()
    expect(onChange).toHaveBeenCalledWith({ state: 'hidden', occurredAt: 25 })
    unsubscribe()
    expect(port.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      listener,
    )
  })

  it('degrades an unsupported visibility surface to visible with no-op cleanup', () => {
    const visibility = new BrowserPageVisibility(null, { now: () => 0 })
    expect(visibility.getState()).toBe('visible')
    expect(() => visibility.subscribe(vi.fn())()).not.toThrow()
  })
})
