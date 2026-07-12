import { describe, expect, it } from 'vitest'

import { BrowserMonotonicClock } from './Clock'

describe('BrowserMonotonicClock', () => {
  it('reads occurrence time only from its monotonic performance port', () => {
    let now = 12.5
    const clock = new BrowserMonotonicClock({ now: () => now })

    expect(clock.now()).toBe(12.5)
    now = 48
    expect(clock.now()).toBe(48)
  })
})
