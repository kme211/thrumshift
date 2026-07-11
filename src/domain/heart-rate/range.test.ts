import { describe, expect, it } from 'vitest'

import { isValidHeartRateBpm } from './range'

describe('isValidHeartRateBpm', () => {
  it.each([1, 72, 65_535])(
    'accepts positive integer BPM values such as %s',
    (bpm) => {
      expect(isValidHeartRateBpm(bpm)).toBe(true)
    },
  )

  it.each([0, -1, 72.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid BPM values such as %s',
    (bpm) => {
      expect(isValidHeartRateBpm(bpm)).toBe(false)
    },
  )
})
