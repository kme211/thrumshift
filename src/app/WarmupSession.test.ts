import { describe, expect, it } from 'vitest'

import { defaultGameplayTuning } from '../config/gameplayTuning'
import type { WarmupSessionTuning } from './WarmupSession'
import {
  advanceWarmupSession,
  createWarmupSession,
  invalidateWarmupSession,
} from './WarmupSession'

const targetRange = { lowerBpm: 100, upperBpm: 140 }

const immediateTuning: WarmupSessionTuning = {
  heartRateClassifier: {
    ...defaultGameplayTuning.heartRateClassifier,
    minimumValidSamplesInDensityWindow: 1,
    classificationDwellMs: 0,
    staleAfterMs: 10_000,
  },
  warmup: { qualificationMs: 100 },
  countdown: { durationMs: 50 },
}

describe('warm-up session', () => {
  it('creates matching initial classifier and warm-up state', () => {
    const session = createWarmupSession(25, targetRange, defaultGameplayTuning)

    expect(session).toEqual({
      targetRange,
      classifier: {
        lastProcessedTimeMs: 25,
        latestValidBpm: null,
        latestValidSampleTimeMs: null,
        filteredBpm: null,
        signalQuality: 'insufficient',
        stableClassification: null,
        candidateClassification: null,
        candidateSinceMs: null,
        filterSamples: [],
        validSampleTimesMs: [],
        lastInvalidationReason: null,
      },
      warmup: {
        lastProcessedTimeMs: 25,
        phase: 'warming',
        signalQuality: 'insufficient',
        stableClassification: null,
        operationalSinceMs: null,
        qualifiedAtMs: null,
        countdownStartedAtMs: null,
        completedAtMs: null,
      },
    })
  })

  it('advances valid samples and scheduler time through both states', () => {
    const initial = createWarmupSession(0, targetRange, immediateTuning)
    const sampled = advanceWarmupSession(
      initial,
      { type: 'sample', occurrenceTimeMs: 0, bpm: 110 },
      immediateTuning,
    )
    const advanced = advanceWarmupSession(
      sampled,
      { type: 'timeAdvanced', occurrenceTimeMs: 100 },
      immediateTuning,
    )

    expect(sampled.classifier).toMatchObject({
      latestValidBpm: 110,
      signalQuality: 'usable',
      stableClassification: 'operational',
    })
    expect(sampled.warmup).toMatchObject({
      signalQuality: 'usable',
      stableClassification: 'operational',
      operationalSinceMs: 0,
    })
    expect(advanced.classifier.lastProcessedTimeMs).toBe(100)
    expect(advanced.warmup).toMatchObject({
      lastProcessedTimeMs: 100,
      phase: 'countdown',
      qualifiedAtMs: 100,
      countdownStartedAtMs: 100,
    })
  })

  it('invalid samples preserve latest BPM while resetting both histories', () => {
    const initial = createWarmupSession(0, targetRange, immediateTuning)
    const sampled = advanceWarmupSession(
      initial,
      { type: 'sample', occurrenceTimeMs: 0, bpm: 110 },
      immediateTuning,
    )
    const invalid = advanceWarmupSession(
      sampled,
      { type: 'sample', occurrenceTimeMs: 50, bpm: 0 },
      immediateTuning,
    )

    expect(invalid.classifier).toMatchObject({
      latestValidBpm: 110,
      latestValidSampleTimeMs: 0,
      signalQuality: 'invalid',
      stableClassification: null,
      candidateClassification: null,
      candidateSinceMs: null,
      filterSamples: [],
      validSampleTimesMs: [],
      lastInvalidationReason: 'invalidSample',
    })
    expect(invalid.warmup).toMatchObject({
      phase: 'warming',
      signalQuality: 'invalid',
      stableClassification: null,
      operationalSinceMs: null,
      qualifiedAtMs: null,
      countdownStartedAtMs: null,
    })
  })

  it('invalidates classifier history and countdown qualification together', () => {
    const initial = createWarmupSession(0, targetRange, immediateTuning)
    const sampled = advanceWarmupSession(
      initial,
      { type: 'sample', occurrenceTimeMs: 0, bpm: 110 },
      immediateTuning,
    )
    const countdown = advanceWarmupSession(
      sampled,
      { type: 'timeAdvanced', occurrenceTimeMs: 100 },
      immediateTuning,
    )
    const invalidated = invalidateWarmupSession(
      countdown,
      110,
      'disconnect',
      'disconnect',
      immediateTuning,
    )

    expect(countdown.warmup.phase).toBe('countdown')
    expect(invalidated.classifier).toMatchObject({
      latestValidBpm: 110,
      signalQuality: 'insufficient',
      stableClassification: null,
      filterSamples: [],
      validSampleTimesMs: [],
      lastInvalidationReason: 'disconnect',
    })
    expect(invalidated.warmup).toMatchObject({
      phase: 'warming',
      signalQuality: 'insufficient',
      stableClassification: null,
      operationalSinceMs: null,
      qualifiedAtMs: null,
      countdownStartedAtMs: null,
      completedAtMs: null,
    })
  })

  it('is immutable and deterministic for repeated facts', () => {
    const initial = createWarmupSession(0, targetRange, immediateTuning)
    const snapshot = structuredClone(initial)
    const fact = { type: 'sample', occurrenceTimeMs: 0, bpm: 110 } as const

    const first = advanceWarmupSession(initial, fact, immediateTuning)
    const second = advanceWarmupSession(initial, fact, immediateTuning)

    expect(initial).toEqual(snapshot)
    expect(first).toEqual(second)
    expect(first).not.toBe(initial)
    expect(first.classifier).not.toBe(initial.classifier)
    expect(first.warmup).not.toBe(initial.warmup)
  })

  it('has no React, browser clock, or timer dependency', async () => {
    const source = await import('./WarmupSession?raw')
    expect(source.default).not.toMatch(
      /(?:from ['"]react|window\.|document\.|Date\.now|performance\.now|setTimeout|setInterval)/,
    )
  })
})
