import { describe, expect, it } from 'vitest'

import { defaultGameplayTuning, validateGameplayTuning } from './gameplayTuning'

describe('gameplay tuning', () => {
  it('accepts the centralized defaults', () => {
    expect(validateGameplayTuning(defaultGameplayTuning)).toBe(
      defaultGameplayTuning,
    )
  })

  it.each([
    ['nonpositive duration', { warmup: { qualificationMs: 0 } }],
    ['inverted plausibility bounds', { minimum: 240, maximum: 30 }],
    ['nonpositive density horizon', { densityWindowMs: 0 }],
    ['unreachable hysteresis exits', { hysteresisBpm: 104 }],
    ['inverted product target limits', { targetRange: { minimumBpm: 220 } }],
  ])('rejects %s', (_name, change) => {
    const tuning: GameplayTuning = {
      ...defaultGameplayTuning,
      heartRateClassifier: {
        ...defaultGameplayTuning.heartRateClassifier,
        plausibleBpm:
          'minimum' in change
            ? { minimum: change.minimum, maximum: change.maximum }
            : defaultGameplayTuning.heartRateClassifier.plausibleBpm,
        validDataDensityWindowMs:
          'densityWindowMs' in change
            ? change.densityWindowMs
            : defaultGameplayTuning.heartRateClassifier
                .validDataDensityWindowMs,
        hysteresisBpm:
          'hysteresisBpm' in change
            ? change.hysteresisBpm
            : defaultGameplayTuning.heartRateClassifier.hysteresisBpm,
      },
      warmup: {
        ...defaultGameplayTuning.warmup,
        ...('warmup' in change ? change.warmup : {}),
      },
      targetRange: {
        ...defaultGameplayTuning.targetRange,
        ...('targetRange' in change ? change.targetRange : {}),
      },
    }
    expect(() => validateGameplayTuning(tuning)).toThrow(RangeError)
  })
})

import type { GameplayTuning } from './gameplayTuning'
