import { describe, expect, it } from 'vitest'

import { rangeClassificationIndicator } from './rangeClassificationIndicator'

describe('rangeClassificationIndicator', () => {
  it.each([
    ['above', '▲'],
    ['below', '▼'],
    ['operational', '◆'],
    [null, '◇'],
  ] as const)('maps %s classification to %s', (classification, indicator) => {
    expect(rangeClassificationIndicator(classification)).toBe(indicator)
  })
})
