import { describe, expect, it } from 'vitest'

import { defaultMvpTuning, validateMvpTuning } from './mvpTuning'

describe('MVP tuning', () => {
  it('accepts the centralized defaults', () => {
    expect(validateMvpTuning(defaultMvpTuning)).toBe(defaultMvpTuning)
  })

  it.each([
    ['nonpositive duration', { warmup: { qualificationMs: 0 } }],
    ['inverted plausibility bounds', { minimum: 240, maximum: 30 }],
    ['impossible sample density', { sampleLimit: 2, minimumSamples: 3 }],
    ['unreachable hysteresis exits', { hysteresisBpm: 104 }],
  ])('rejects %s', (_name, change) => {
    const tuning: MvpTuning = {
      ...defaultMvpTuning,
      heartRate: {
        ...defaultMvpTuning.heartRate,
        plausibleBpm:
          'minimum' in change
            ? { minimum: change.minimum, maximum: change.maximum }
            : defaultMvpTuning.heartRate.plausibleBpm,
        rollingSampleLimit:
          'sampleLimit' in change
            ? change.sampleLimit
            : defaultMvpTuning.heartRate.rollingSampleLimit,
        minimumSamplesInWindow:
          'minimumSamples' in change
            ? change.minimumSamples
            : defaultMvpTuning.heartRate.minimumSamplesInWindow,
        hysteresisBpm:
          'hysteresisBpm' in change
            ? change.hysteresisBpm
            : defaultMvpTuning.heartRate.hysteresisBpm,
      },
      warmup: {
        ...defaultMvpTuning.warmup,
        ...('warmup' in change ? change.warmup : {}),
      },
    }
    expect(() => validateMvpTuning(tuning)).toThrow(RangeError)
  })
})

import type { MvpTuning } from './mvpTuning'
