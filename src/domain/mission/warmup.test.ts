import { describe, expect, it } from 'vitest'

import { defaultGameplayTuning } from '../../config/gameplayTuning'
import { createWarmupState, transitionWarmup } from './warmup'
import type { WarmupFact, WarmupState } from './warmup'

const warmupTuning = defaultGameplayTuning.warmup
const countdownTuning = defaultGameplayTuning.countdown
const operational = (time: number): WarmupFact => ({
  type: 'classifierUpdated',
  occurrenceTimeMs: time,
  signalQuality: 'usable',
  stableClassification: 'operational',
})
const advance = (time: number): WarmupFact => ({
  type: 'timeAdvanced',
  occurrenceTimeMs: time,
})

function run(facts: readonly WarmupFact[]): WarmupState {
  let state = createWarmupState(0)
  for (const fact of facts) {
    state = transitionWarmup(state, fact, warmupTuning, countdownTuning)
  }
  return state
}

describe('warm-up qualification and countdown', () => {
  it('requires consecutive operational dwell and starts countdown at its exact deadline', () => {
    const state = run([operational(0), advance(9_999), advance(10_000)])
    expect(state).toMatchObject({
      phase: 'countdown',
      qualifiedAtMs: 10_000,
      countdownStartedAtMs: 10_000,
    })
  })

  it.each([
    [
      'stable exit',
      {
        type: 'classifierUpdated',
        occurrenceTimeMs: 5_000,
        signalQuality: 'usable',
        stableClassification: 'below',
      },
    ],
    [
      'stale signal',
      {
        type: 'classifierUpdated',
        occurrenceTimeMs: 5_000,
        signalQuality: 'stale',
        stableClassification: null,
      },
    ],
    [
      'disconnect',
      { type: 'invalidate', occurrenceTimeMs: 5_000, reason: 'disconnect' },
    ],
    [
      'hidden page',
      { type: 'invalidate', occurrenceTimeMs: 5_000, reason: 'hidden' },
    ],
  ] as const)('resets qualification on %s', (_name, resetFact) => {
    let state = run([operational(0), advance(4_000), resetFact])
    state = transitionWarmup(
      state,
      operational(6_000),
      warmupTuning,
      countdownTuning,
    )
    state = transitionWarmup(
      state,
      advance(15_999),
      warmupTuning,
      countdownTuning,
    )
    expect(state.phase).toBe('warming')
    expect(state.operationalSinceMs).toBe(6_000)
  })

  it('cancels countdown when qualification is lost and cannot complete stale work', () => {
    let state = run([operational(0), advance(10_000)])
    state = transitionWarmup(
      state,
      {
        type: 'invalidate',
        occurrenceTimeMs: 11_000,
        reason: 'manualSuspension',
      },
      warmupTuning,
      countdownTuning,
    )
    state = transitionWarmup(
      state,
      advance(20_000),
      warmupTuning,
      countdownTuning,
    )
    expect(state).toMatchObject({
      phase: 'warming',
      qualifiedAtMs: null,
      countdownStartedAtMs: null,
      completedAtMs: null,
    })
  })

  it('completes countdown at its exact derived deadline', () => {
    const state = run([operational(0), advance(13_000)])
    expect(state).toMatchObject({ phase: 'complete', completedAtMs: 13_000 })
  })

  it('produces equivalent results for one large or many small advances', () => {
    const large = run([operational(0), advance(13_500)])
    const small = run([
      operational(0),
      advance(1_000),
      advance(4_000),
      advance(9_999),
      advance(10_000),
      advance(11_500),
      advance(13_500),
    ])
    expect(large).toEqual(small)
  })

  it('uses advance-then-apply precedence at an equal-time completion boundary', () => {
    const state = run([
      operational(0),
      advance(10_000),
      {
        type: 'invalidate',
        occurrenceTimeMs: 13_000,
        reason: 'disconnect',
      },
    ])
    expect(state).toMatchObject({ phase: 'complete', completedAtMs: 13_000 })
  })

  it('rejects out-of-order time', () => {
    const state = run([operational(5_000)])
    expect(() =>
      transitionWarmup(state, advance(4_999), warmupTuning, countdownTuning),
    ).toThrow(RangeError)
  })
})
