import { describe, expect, it, vi } from 'vitest'

import {
  BrowserScreenWakeLock,
  type WakeLockRequestPort,
  type WakeLockSentinelPort,
} from './ScreenWakeLock'

function createSentinel() {
  let releaseListener: (() => void) | undefined
  let released = false
  const sentinel: WakeLockSentinelPort = {
    get released() {
      return released
    },
    release: vi.fn(async () => {
      released = true
    }),
    addEventListener: (_type, listener) => {
      releaseListener = listener
    },
    removeEventListener: vi.fn(),
  }
  return {
    sentinel,
    revoke: () => {
      released = true
      releaseListener?.()
    },
  }
}

describe('BrowserScreenWakeLock', () => {
  it('acquires, releases, and reacquires after platform revocation', async () => {
    const first = createSentinel()
    const second = createSentinel()
    const request = vi
      .fn()
      .mockResolvedValueOnce(first.sentinel)
      .mockResolvedValueOnce(second.sentinel)
    const wakeLock = new BrowserScreenWakeLock({ request })

    await wakeLock.setActive(true)
    expect(request).toHaveBeenCalledWith('screen')
    first.revoke()
    await Promise.resolve()
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(2)

    await wakeLock.setActive(false)
    expect(second.sentinel.release).toHaveBeenCalledOnce()
  })

  it('releases a late acquisition after cancellation', async () => {
    let resolveRequest: ((sentinel: WakeLockSentinelPort) => void) | undefined
    const port: WakeLockRequestPort = {
      request: () =>
        new Promise((resolve) => {
          resolveRequest = resolve
        }),
    }
    const candidate = createSentinel()
    const wakeLock = new BrowserScreenWakeLock(port)

    const acquire = wakeLock.setActive(true)
    await Promise.resolve()
    const release = wakeLock.setActive(false)
    resolveRequest?.(candidate.sentinel)
    await acquire
    await release
    expect(candidate.sentinel.release).toHaveBeenCalledOnce()
  })

  it('is idempotent on cleanup and ignores stale work after disposal', async () => {
    const current = createSentinel()
    const request = vi.fn().mockResolvedValue(current.sentinel)
    const wakeLock = new BrowserScreenWakeLock({ request })
    await wakeLock.setActive(true)
    await wakeLock.dispose()
    await wakeLock.dispose()
    await wakeLock.setActive(true)
    expect(current.sentinel.release).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledOnce()
  })

  it('degrades unsupported and rejected requests without throwing', async () => {
    const unsupported = new BrowserScreenWakeLock(null)
    expect(unsupported.capability).toEqual({ supported: false })
    await expect(unsupported.setActive(true)).resolves.toBeUndefined()

    const rejected = new BrowserScreenWakeLock({
      request: vi.fn().mockRejectedValue(new Error('denied')),
    })
    await expect(rejected.setActive(true)).resolves.toBeUndefined()
  })
})
