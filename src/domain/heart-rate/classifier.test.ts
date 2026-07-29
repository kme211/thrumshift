import { describe, expect, it } from 'vitest'

import { defaultGameplayTuning } from '../../config/gameplayTuning'
import type { HeartRateClassifierTuning } from '../../config/gameplayTuning'
import {
  createClassifierState,
  transitionClassifier,
  validateTargetRange,
} from './classifier'
import type { ClassifierFact, ClassifierState } from './classifier'

const range = { lowerBpm: 100, upperBpm: 140 }
const tuning = defaultGameplayTuning.heartRateClassifier

function run(
  facts: readonly ClassifierFact[],
  selectedTuning = tuning,
): ClassifierState {
  let state = createClassifierState(0)
  for (const fact of facts) {
    state = transitionClassifier(state, fact, range, selectedTuning).state
  }
  return state
}

function sample(occurrenceTimeMs: number, bpm: number): ClassifierFact {
  return { type: 'sample', occurrenceTimeMs, bpm }
}

function immediateTuning(): HeartRateClassifierTuning {
  return {
    ...tuning,
    filterWindowMs: 10_000,
    filterSampleLimit: 1,
    minimumValidSamplesInDensityWindow: 1,
    staleAfterMs: 10_000,
    classificationDwellMs: 1_000,
  }
}

describe('target range and raw BPM boundaries', () => {
  it.each([
    [99, 'below'],
    [100, 'operational'],
    [140, 'operational'],
    [141, 'above'],
  ] as const)('classifies %i BPM as %s after dwell', (bpm, expected) => {
    const selected = immediateTuning()
    const state = run([sample(0, bpm), sample(1_000, bpm)], selected)
    expect(state.stableClassification).toBe(expected)
  })

  it('validates ordered integer target bounds within gameplay plausibility', () => {
    expect(validateTargetRange(range, tuning)).toBe(range)
    expect(() =>
      validateTargetRange({ lowerBpm: 140, upperBpm: 100 }, tuning),
    ).toThrow(RangeError)
    expect(() =>
      validateTargetRange({ lowerBpm: 29, upperBpm: 100 }, tuning),
    ).toThrow(RangeError)
  })

  it.each([
    { lowerBpm: 33, upperBpm: 100 },
    { lowerBpm: 100, upperBpm: 237 },
  ])(
    'rejects a target range with an unreachable hysteresis exit: %o',
    (edgeRange) => {
      expect(() => validateTargetRange(edgeRange, tuning)).toThrow(RangeError)
    },
  )
})

describe('rolling signal policy', () => {
  it('keeps filter and valid-data density horizons independent', () => {
    expect(tuning).toMatchObject({
      filterWindowMs: 3_000,
      validDataDensityWindowMs: 4_000,
      minimumValidSamplesInDensityWindow: 3,
      staleAfterMs: 3_000,
    })
  })

  it('keeps an established classification usable across captured HR6 cadence gaps', () => {
    let state = createClassifierState(0)
    const sampleTimes = [0, 1_094, 2_190, 3_284, 4_380, 5_474, 6_570]
    for (const time of sampleTimes) {
      if (time > 0) {
        state = transitionClassifier(
          state,
          { type: 'timeAdvanced', occurrenceTimeMs: time - 80 },
          range,
          tuning,
        ).state
        if (time >= 4_380) {
          expect(state.signalQuality).toBe('usable')
          expect(state.stableClassification).toBe('operational')
          expect(state.filteredBpm).toBe(110)
        }
      }
      state = transitionClassifier(
        state,
        sample(time, 110),
        range,
        tuning,
      ).state
    }
    expect(state.signalQuality).toBe('usable')
    expect(state.stableClassification).toBe('operational')
  })

  it('does not recompute the filter from two samples on a scheduler-only advance', () => {
    let state = run([sample(0, 100), sample(1_094, 110), sample(2_190, 120)])
    expect(state.filteredBpm).toBe(110)
    state = transitionClassifier(
      state,
      { type: 'timeAdvanced', occurrenceTimeMs: 3_080 },
      range,
      tuning,
    ).state
    expect(state.filterSamples).toHaveLength(2)
    expect(state.validSampleTimesMs).toHaveLength(3)
    expect(state.signalQuality).toBe('usable')
    expect(state.filteredBpm).toBe(110)
  })

  it.each([0, -1, 72.5, Number.NaN, 29, 241])(
    'rejects invalid or implausible BPM %s without replacing the latest valid BPM',
    (bpm) => {
      let state = run([sample(0, 72)])
      state = transitionClassifier(state, sample(1, bpm), range, tuning).state
      expect(state).toMatchObject({
        latestValidBpm: 72,
        latestValidSampleTimeMs: 0,
        signalQuality: 'invalid',
        stableClassification: null,
        filterSamples: [],
      })
    },
  )

  it('uses the median of the latest five samples and rejects one spike', () => {
    const state = run([
      sample(0, 110),
      sample(500, 111),
      sample(1_000, 220),
      sample(1_500, 112),
      sample(2_000, 113),
    ])
    expect(state.filteredBpm).toBe(112)
    expect(state.stableClassification).toBeNull()
    expect(state.candidateClassification).toBe('operational')
  })

  it('changes only after a sustained filtered change and dwell', () => {
    const selected = immediateTuning()
    let state = run([sample(0, 110), sample(1_000, 110)], selected)
    expect(state.stableClassification).toBe('operational')
    state = transitionClassifier(
      state,
      sample(1_100, 170),
      range,
      selected,
    ).state
    expect(state.stableClassification).toBe('operational')
    state = transitionClassifier(
      state,
      sample(2_100, 170),
      range,
      selected,
    ).state
    expect(state.stableClassification).toBe('above')
  })

  it('reports sparse valid samples as connected-but-unusable', () => {
    const state = run([sample(0, 110), sample(2_000, 110)])
    expect(state.signalQuality).toBe('insufficient')
    expect(state.stableClassification).toBeNull()
  })

  it('becomes insufficient for a genuinely sparse non-stale stream', () => {
    let state = run([sample(0, 110), sample(1_500, 110), sample(3_000, 110)])
    expect(state.signalQuality).toBe('usable')
    state = transitionClassifier(
      state,
      { type: 'timeAdvanced', occurrenceTimeMs: 4_001 },
      range,
      tuning,
    ).state
    expect(state.signalQuality).toBe('insufficient')
    expect(state.stableClassification).toBeNull()
  })

  it('invalidates alternating valid and invalid samples instead of accumulating density', () => {
    const state = run([
      sample(0, 110),
      sample(500, 0),
      sample(1_000, 110),
      sample(1_500, 241),
      sample(2_000, 110),
    ])
    expect(state.signalQuality).toBe('insufficient')
    expect(state.filterSamples).toHaveLength(1)
    expect(state.stableClassification).toBeNull()
  })
})

describe('hysteresis, dwell, staleness, and invalidation', () => {
  it('is deterministic for large and small wakes across the HR6 cadence', () => {
    const facts = [
      sample(0, 110),
      sample(1_094, 110),
      sample(2_190, 110),
      sample(3_284, 110),
      sample(4_380, 110),
    ]
    const initial = run(facts)
    const large = transitionClassifier(
      initial,
      { type: 'timeAdvanced', occurrenceTimeMs: 6_000 },
      range,
      tuning,
    ).state
    let small = initial
    for (const time of [5_100, 5_300, 5_700, 6_000]) {
      small = transitionClassifier(
        small,
        { type: 'timeAdvanced', occurrenceTimeMs: time },
        range,
        tuning,
      ).state
    }
    expect(large).toEqual(small)
    expect(large.stableClassification).toBe('operational')
  })

  it('still becomes stale three seconds after the last HR6 sample', () => {
    const state = run([
      sample(0, 110),
      sample(1_094, 110),
      sample(2_190, 110),
      sample(3_284, 110),
      sample(4_380, 110),
    ])
    const stale = transitionClassifier(
      state,
      { type: 'timeAdvanced', occurrenceTimeMs: 7_380 },
      range,
      tuning,
    ).state
    expect(stale.signalQuality).toBe('stale')
    expect(stale.stableClassification).toBeNull()
  })

  it('derives dwell before later staleness regardless of wake-up size', () => {
    const facts = [sample(0, 110), sample(500, 110), sample(1_000, 110)]
    const large = transitionClassifier(
      run(facts),
      { type: 'timeAdvanced', occurrenceTimeMs: 5_000 },
      range,
      tuning,
    )

    let smallState = run(facts)
    const smallChanges = []
    for (const occurrenceTimeMs of [3_000, 4_000, 5_000]) {
      const result = transitionClassifier(
        smallState,
        { type: 'timeAdvanced', occurrenceTimeMs },
        range,
        tuning,
      )
      smallState = result.state
      if (result.classificationChange !== null) {
        smallChanges.push(result.classificationChange)
      }
    }

    expect(large.classificationChange).toEqual({
      kind: 'established',
      previous: null,
      current: 'operational',
      occurrenceTimeMs: 3_000,
    })
    expect(smallChanges).toEqual([large.classificationChange])
    expect(large.state).toEqual(smallState)
    expect(large.state.signalQuality).toBe('stale')
    expect(large.state.stableClassification).toBeNull()
  })

  it('exposes derived authority projections at their exact deadlines', () => {
    const result = transitionClassifier(
      run([sample(0, 110), sample(500, 110), sample(1_000, 110)]),
      { type: 'timeAdvanced', occurrenceTimeMs: 5_000 },
      range,
      tuning,
    )

    expect(result.projections).toEqual([
      {
        occurrenceTimeMs: 3_000,
        signalQuality: 'usable',
        stableClassification: 'operational',
      },
      {
        occurrenceTimeMs: 4_000,
        signalQuality: 'stale',
        stableClassification: null,
      },
    ])
  })

  it('timestamps classification at the derived dwell deadline', () => {
    const result = transitionClassifier(
      run([sample(0, 110), sample(500, 110), sample(1_000, 110)]),
      { type: 'timeAdvanced', occurrenceTimeMs: 3_500 },
      range,
      tuning,
    )
    expect(result.classificationChange?.occurrenceTimeMs).toBe(3_000)
  })

  it('holds operational inside the exit margin and re-enters at the target bound', () => {
    const selected = immediateTuning()
    let state = run([sample(0, 110), sample(1_000, 110)], selected)
    state = transitionClassifier(
      state,
      sample(2_000, 98),
      range,
      selected,
    ).state
    state = transitionClassifier(
      state,
      sample(3_000, 98),
      range,
      selected,
    ).state
    expect(state.stableClassification).toBe('operational')
    state = transitionClassifier(
      state,
      sample(4_000, 96),
      range,
      selected,
    ).state
    state = transitionClassifier(
      state,
      sample(5_000, 96),
      range,
      selected,
    ).state
    expect(state.stableClassification).toBe('below')
    state = transitionClassifier(
      state,
      sample(6_000, 100),
      range,
      selected,
    ).state
    state = transitionClassifier(
      state,
      sample(7_000, 100),
      range,
      selected,
    ).state
    expect(state.stableClassification).toBe('operational')
  })

  it('becomes stale at the exact threshold and creates no classification change', () => {
    const selected = immediateTuning()
    let state = run([sample(0, 110), sample(1_000, 110)], selected)
    const result = transitionClassifier(
      state,
      { type: 'timeAdvanced', occurrenceTimeMs: 11_000 },
      range,
      selected,
    )
    state = result.state
    expect(state.signalQuality).toBe('stale')
    expect(state.stableClassification).toBeNull()
    expect(result.classificationChange).toBeNull()
  })

  it('requires fresh density and dwell after explicit invalidation', () => {
    const selected = immediateTuning()
    let state = run([sample(0, 110), sample(1_000, 110)], selected)
    state = transitionClassifier(
      state,
      { type: 'invalidate', occurrenceTimeMs: 1_100, reason: 'hidden' },
      range,
      selected,
    ).state
    expect(state).toMatchObject({
      stableClassification: null,
      lastInvalidationReason: 'hidden',
      latestValidBpm: 110,
    })
    let result = transitionClassifier(
      state,
      sample(1_200, 110),
      range,
      selected,
    )
    expect(result.classificationChange).toBeNull()
    result = transitionClassifier(
      result.state,
      sample(2_200, 110),
      range,
      selected,
    )
    expect(result.classificationChange).toMatchObject({
      kind: 'established',
      previous: null,
      current: 'operational',
    })
  })

  it('follows advance-then-apply ordering for equal-time facts', () => {
    const selected = immediateTuning()
    let state = run([sample(0, 110)], selected)
    const invalidated = transitionClassifier(
      state,
      { type: 'invalidate', occurrenceTimeMs: 1_000, reason: 'disconnect' },
      range,
      selected,
    )
    expect(invalidated.classificationChange?.kind).toBe('established')
    expect(invalidated.state.stableClassification).toBeNull()
    state = transitionClassifier(
      invalidated.state,
      { type: 'timeAdvanced', occurrenceTimeMs: 1_000 },
      range,
      selected,
    ).state
    expect(state.stableClassification).toBeNull()
  })

  it('has no React, Bluetooth, wall-clock, performance, or timer dependency', async () => {
    const source = await import('./classifier?raw')
    expect(source.default).not.toMatch(
      /(?:from ['"]react|Bluetooth|Date\.now|performance\.now|setTimeout)/,
    )
  })
})
