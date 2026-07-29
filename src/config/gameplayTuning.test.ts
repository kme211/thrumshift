import { describe, expect, it } from 'vitest'

import {
  defaultGameplayTuning,
  validateGameplayTuning,
  validateMissionStatisticsTuning,
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
    [
      'nonpositive statistics sample threshold',
      { missionStatistics: { minimumValidSampleCount: 0 } },
    ],
    [
      'nonpositive statistics duration threshold',
      { missionStatistics: { minimumUsableDurationMs: 0 } },
    ],
    ['nonpositive hint delay', { puzzle: { hintEligibilityMs: 0 } }],
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
      missionStatistics: {
        ...defaultGameplayTuning.missionStatistics,
        ...('missionStatistics' in change ? change.missionStatistics : {}),
      },
      puzzle: {
        ...defaultGameplayTuning.puzzle,
        ...('puzzle' in change ? change.puzzle : {}),
      },
    }
    expect(() => validateGameplayTuning(tuning)).toThrow(RangeError)
  })

  it('accepts the documented station-stability defaults', () => {
    expect(validateStabilityTuning(defaultGameplayTuning.stability)).toBe(
      defaultGameplayTuning.stability,
    )
  })

  it('accepts the centralized mission-statistics thresholds', () => {
    expect(
      validateMissionStatisticsTuning(defaultGameplayTuning.missionStatistics),
    ).toBe(defaultGameplayTuning.missionStatistics)
  })

  it.each(['minimumValidSampleCount', 'minimumUsableDurationMs'] as const)(
    'rejects runtime mission-statistics tuning missing %s',
    (missingProperty) => {
      const runtimeInput = Object.fromEntries(
        Object.entries(defaultGameplayTuning.missionStatistics).filter(
          ([name]) => name !== missingProperty,
        ),
      )
      expect(() => validateMissionStatisticsTuning(runtimeInput)).toThrow(
        RangeError,
      )
    },
  )

  it.each([undefined, '3', Number.NaN, Number.POSITIVE_INFINITY, 1.5, 0, -1])(
    'rejects invalid mission-statistics threshold %#',
    (value) => {
      expect(() =>
        validateMissionStatisticsTuning({
          ...defaultGameplayTuning.missionStatistics,
          minimumValidSampleCount: value,
        }),
      ).toThrow(RangeError)
    },
  )

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
