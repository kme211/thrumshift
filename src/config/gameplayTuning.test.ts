import { describe, expect, it } from 'vitest'

import {
  defaultGameplayTuning,
  validateGameplayTuning,
  validateStabilityTuning,
} from './gameplayTuning'

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

  it('accepts the documented station-stability defaults', () => {
    expect(validateStabilityTuning(defaultGameplayTuning.stability)).toBe(
      defaultGameplayTuning.stability,
    )
  })

  const requiredStabilityProperties = [
    'minimum',
    'maximum',
    'initial',
    'belowDrainPerSecond',
    'aboveDrainPerSecond',
    'operationalRecoveryPerSecond',
  ] as const

  it.each(requiredStabilityProperties)(
    'rejects runtime stability tuning missing %s',
    (missingProperty) => {
      const runtimeInput: unknown = Object.fromEntries(
        Object.entries(defaultGameplayTuning.stability).filter(
          ([name]) => name !== missingProperty,
        ),
      )
      expect(() => validateStabilityTuning(runtimeInput)).toThrow(RangeError)
    },
  )

  it.each([undefined, null, 'stability', 42, []])(
    'rejects non-object runtime stability tuning %#',
    (runtimeInput: unknown) => {
      expect(() => validateStabilityTuning(runtimeInput)).toThrow(RangeError)
    },
  )

  it.each(
    requiredStabilityProperties.flatMap((property) =>
      [undefined, '1', null, {}].map((value) => [property, value] as const),
    ),
  )(
    'rejects an incorrect runtime type for stability.%s set to %#',
    (property, value) => {
      const runtimeInput: unknown = {
        ...defaultGameplayTuning.stability,
        [property]: value,
      }
      expect(() => validateStabilityTuning(runtimeInput)).toThrow(RangeError)
    },
  )

  it.each(
    requiredStabilityProperties.flatMap((property) =>
      [
        ['NaN', Number.NaN],
        ['positive infinity', Number.POSITIVE_INFINITY],
        ['negative infinity', Number.NEGATIVE_INFINITY],
      ].map(([name, value]) => [property, name, value] as const),
    ),
  )('rejects stability.%s set to %s', (property, _name, value) => {
    const runtimeInput: unknown = {
      ...defaultGameplayTuning.stability,
      [property]: value,
    }
    expect(() => validateStabilityTuning(runtimeInput)).toThrow(RangeError)
  })

  it.each([
    ['a non-finite value', { maximum: Number.POSITIVE_INFINITY }],
    ['unordered bounds', { minimum: 100 }],
    ['initial stability at failure', { initial: 0 }],
    ['initial stability above maximum', { initial: 101 }],
    ['a nonpositive below drain', { belowDrainPerSecond: 0 }],
    ['a nonpositive above drain', { aboveDrainPerSecond: -1 }],
    ['negative operational recovery', { operationalRecoveryPerSecond: -1 }],
  ])('rejects stability tuning with %s', (_name, change) => {
    expect(() =>
      validateStabilityTuning({
        ...defaultGameplayTuning.stability,
        ...change,
      }),
    ).toThrow(RangeError)
  })
})

import type { GameplayTuning } from './gameplayTuning'
