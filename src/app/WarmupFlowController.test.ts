import { describe, expect, it } from 'vitest'

import type { HeartRateSample } from '../domain/heart-rate/types'
import {
  createWarmupFlowState,
  warmupFlowReducer,
} from './WarmupFlowController'
import type {
  WarmupFlowFactPayload,
  WarmupFlowState,
} from './WarmupFlowController'

const source = { id: 'test', type: 'simulated' } as const
const sample = (time: number, bpm: number): WarmupFlowFactPayload => ({
  type: 'sample',
  sample: { occurrenceTimeMs: time, bpm, source } satisfies HeartRateSample,
})

function run(facts: readonly WarmupFlowFactPayload[]): WarmupFlowState {
  return runFrom(createWarmupFlowState(), facts)
}

function apply(
  state: WarmupFlowState,
  fact: WarmupFlowFactPayload,
  sequence = state.lastAppliedSequence + 1,
): WarmupFlowState {
  return warmupFlowReducer(state, { ...fact, sequence })
}

function runFrom(
  initial: WarmupFlowState,
  facts: readonly WarmupFlowFactPayload[],
): WarmupFlowState {
  let state = initial
  for (const fact of facts) state = apply(state, fact)
  return state
}

const connected = (time = 0): WarmupFlowFactPayload => ({
  type: 'status',
  occurredAt: time,
  status: { state: 'connected' },
})
const begin = (time = 0): WarmupFlowFactPayload => ({
  type: 'beginWarmup',
  occurredAt: time,
})
const advance = (time: number): WarmupFlowFactPayload => ({
  type: 'timeAdvanced',
  occurredAt: time,
  runGeneration: 1,
})

function sustainedOperationalSamples(endTime: number): WarmupFlowFactPayload[] {
  const facts: WarmupFlowFactPayload[] = [sample(0, 110), sample(500, 110)]
  for (let time = 1_000; time <= endTime; time += 1_000) {
    facts.push(sample(time, 110))
  }
  return facts
}

describe('warm-up flow controller', () => {
  it('records sanitized events with relative monotonic time and sequence order', () => {
    let state = createWarmupFlowState(true)
    state = apply(state, connected(10))
    state = apply(state, begin(20))
    state = apply(state, {
      type: 'sample',
      sample: {
        occurrenceTimeMs: 30,
        bpm: 112,
        source: { id: 'private-device-id', type: 'bluetooth' },
        rrIntervalsMs: [800, 810],
      },
    })

    const sampleEvent = state.diagnosticLog.find(
      ({ category }) => category === 'sampleReceived',
    )
    expect(sampleEvent).toMatchObject({
      occurrenceTimeMs: 20,
      category: 'sampleReceived',
      details: {
        bpm: 112,
        sourceType: 'bluetooth',
        rrIntervalCount: 2,
      },
      lifecycleBefore: 'warming',
      lifecycleAfter: 'warming',
      transportStatus: 'connected',
      signalQuality: 'insufficient',
    })
    expect(state.diagnosticLog.map(({ sequence }) => sequence)).toEqual(
      state.diagnosticLog.map((_entry, index) => index + 1),
    )
    expect(
      state.diagnosticLog.map(({ occurrenceTimeMs }) => occurrenceTimeMs),
    ).toEqual(
      [...state.diagnosticLog]
        .map(({ occurrenceTimeMs }) => occurrenceTimeMs)
        .sort((a, b) => a - b),
    )
    expect(JSON.stringify(state.diagnosticLog)).not.toContain(
      'private-device-id',
    )
  })

  it('bounds diagnostics to the latest 1,000 events', () => {
    let state = createWarmupFlowState(true)
    for (let index = 0; index < 1_005; index += 1) {
      state = apply(state, connected(index))
    }
    expect(state.diagnosticLog).toHaveLength(1_000)
    expect(state.diagnosticLog[0]?.sequence).toBe(6)
    expect(state.diagnosticLog[999]?.sequence).toBe(1_005)
  })

  it('resetting diagnostics clears the prior session and restarts relative time', () => {
    let state = createWarmupFlowState(true)
    state = apply(state, connected(100))
    state = apply(state, {
      type: 'resetDiagnostics',
      occurredAt: 120,
    })
    expect(state.diagnosticLog).toEqual([])
    expect(state.diagnosticSessionStartMs).toBeNull()
    state = apply(state, {
      type: 'status',
      occurredAt: 200,
      status: { state: 'disconnected' },
    })
    expect(state.diagnosticLog[0]).toMatchObject({
      sequence: 1,
      occurrenceTimeMs: 0,
    })
  })

  it('uses the diagnostics-disabled fast path without allocating log entries', () => {
    const state = createWarmupFlowState(false)
    const log = state.diagnosticLog
    const next = apply(state, connected(10))
    expect(next.diagnosticLog).toBe(log)
    expect(next.diagnosticLog).toHaveLength(0)
    expect(next.diagnosticSessionStartMs).toBeNull()
  })

  it('does not let diagnostic recording change canonical application state', () => {
    const facts = [connected(), begin(), sample(0, 110), advance(100)]
    const disabled = runFrom(createWarmupFlowState(false), facts)
    const enabled = runFrom(createWarmupFlowState(true), facts)
    expect({
      lifecycle: enabled.lifecycle,
      targetRange: enabled.targetRange,
      targetDraft: enabled.targetDraft,
      targetError: enabled.targetError,
      telemetryStatus: enabled.telemetryStatus,
      latestPreMissionBpm: enabled.latestPreMissionBpm,
      announcement: enabled.announcement,
      runGeneration: enabled.runGeneration,
    }).toEqual({
      lifecycle: disabled.lifecycle,
      targetRange: disabled.targetRange,
      targetDraft: disabled.targetDraft,
      targetError: disabled.targetError,
      telemetryStatus: disabled.telemetryStatus,
      latestPreMissionBpm: disabled.latestPreMissionBpm,
      announcement: disabled.announcement,
      runGeneration: disabled.runGeneration,
    })
  })

  it('uses the same status/sample facts regardless of source identity', () => {
    const simulated = run([connected(), begin(), sample(0, 110)])
    const bluetoothSample: WarmupFlowFactPayload = {
      type: 'sample',
      sample: {
        occurrenceTimeMs: 0,
        bpm: 110,
        source: { id: 'bluetooth-heart-rate', type: 'bluetooth' },
      },
    }
    const bluetooth = run([connected(), begin(), bluetoothSample])
    expect(bluetooth.lifecycle).toEqual(simulated.lifecycle)
  })

  it('orders samples and time advancement through domain transitions', () => {
    const state = run([
      connected(),
      begin(),
      ...sustainedOperationalSamples(13_000),
    ])
    expect(state.lifecycle.phase).toBe('countdown')
    if (state.lifecycle.phase === 'countdown') {
      expect(state.lifecycle.warmup.warmup.countdownStartedAtMs).toBe(13_000)
    }
  })

  it('continues warm-up progress across captured HR6 notification gaps', () => {
    let state = run([connected(), begin()])
    let progressStarted = false
    const sampleTimes = [
      0, 1_094, 2_190, 3_284, 4_380, 5_474, 6_570, 7_664, 8_760, 9_854, 10_950,
      12_044, 13_140, 14_234, 15_330,
    ]
    for (const time of sampleTimes) {
      if (time > 0) {
        state = apply(state, advance(time - 80))
        if (state.lifecycle.phase === 'warming') {
          const progress = state.lifecycle.warmup.warmup
          if (progress.operationalSinceMs !== null) progressStarted = true
          if (progressStarted) {
            expect(progress.operationalSinceMs).not.toBeNull()
            expect(state.lifecycle.warmup.classifier.signalQuality).toBe(
              'usable',
            )
          }
        }
      }
      state = apply(state, sample(time, 110))
    }
    expect(progressStarted).toBe(true)
    expect(state.lifecycle.phase).toBe('countdown')
  })

  it('completes only the current valid countdown', () => {
    const completed = run([
      connected(),
      begin(),
      ...sustainedOperationalSamples(13_000),
      advance(16_000),
    ])
    expect(completed.lifecycle.phase).toBe('activeMission')

    const cancelled = run([
      connected(),
      begin(),
      ...sustainedOperationalSamples(13_000),
      { type: 'status', occurredAt: 14_000, status: { state: 'disconnected' } },
      advance(20_000),
    ])
    expect(cancelled.lifecycle.phase).toBe('suspended')
  })

  it('ignores stale scheduler completion from an earlier run generation', () => {
    const state = runFrom(createWarmupFlowState(true), [
      connected(),
      begin(),
      ...sustainedOperationalSamples(13_000),
    ])
    expect(state.lifecycle.phase).toBe('countdown')
    const unchanged = apply(state, {
      type: 'timeAdvanced',
      occurredAt: 16_000,
      runGeneration: 0,
    })
    expect(unchanged.lifecycle).toBe(state.lifecycle)
    expect(unchanged.lastAppliedOccurrenceTimeMs).toBe(16_000)
    expect(unchanged.lastAppliedSequence).toBe(state.lastAppliedSequence + 1)
    expect(unchanged.diagnosticLog.at(-1)?.category).toBe(
      'ignoredStaleGenerationCallback',
    )
  })

  it('suspends on stale signal and recovers only after fresh classification', () => {
    let state = run([
      connected(),
      begin(),
      sample(0, 110),
      sample(1_094, 110),
      sample(2_190, 110),
      sample(3_284, 110),
      sample(4_380, 110),
      advance(7_380),
    ])
    expect(state.lifecycle.phase).toBe('suspended')
    if (state.lifecycle.phase !== 'suspended') return
    expect(state.lifecycle.reasons).toContain('staleSignal')
    expect(state.lifecycle.resumeTarget.phase).toBe('warming')

    for (const time of [8_000, 9_094, 10_190, 11_284, 12_380]) {
      state = apply(state, sample(time, 110))
    }
    expect(state.lifecycle.phase).toBe('warming')
    if (state.lifecycle.phase === 'warming') {
      expect(state.lifecycle.warmup.classifier.signalQuality).toBe('usable')
      expect(state.lifecycle.warmup.classifier.stableClassification).toBe(
        'operational',
      )
      expect(state.lifecycle.warmup.warmup.operationalSinceMs).toBe(12_380)
    }
  })

  it('uses explicit target-range invalidation while retaining latest BPM', () => {
    let state = runFrom(createWarmupFlowState(true), [
      connected(),
      begin(),
      sample(100, 110),
    ])
    state = apply(state, {
      type: 'targetDraftChanged',
      occurredAt: 200,
      field: 'lower',
      value: '105',
    })
    state = apply(state, {
      type: 'targetCommitted',
      occurredAt: 200,
    })
    expect(state.targetRange.lowerBpm).toBe(105)
    if (state.lifecycle.phase === 'warming') {
      expect(state.lifecycle.warmup.classifier.latestValidBpm).toBe(110)
      expect(state.lifecycle.warmup.classifier.lastInvalidationReason).toBe(
        'targetRangeChanged',
      )
      expect(state.lifecycle.warmup.classifier.filterSamples).toEqual([])
      expect(state.lifecycle.warmup.warmup.operationalSinceMs).toBeNull()
    }
    expect(state.diagnosticLog).toContainEqual(
      expect.objectContaining({
        category: 'classifierInvalidated',
        details: { reason: 'targetRangeChanged' },
      }),
    )
  })

  it('preserves overlapping stale, hidden, and disconnect blockers', () => {
    let state = run([
      connected(),
      begin(),
      sample(0, 110),
      sample(1_000, 110),
      sample(2_000, 110),
      advance(5_000),
    ])
    state = apply(state, {
      type: 'visibility',
      occurredAt: 5_100,
      state: 'hidden',
    })
    state = apply(state, {
      type: 'status',
      occurredAt: 5_200,
      status: { state: 'disconnected' },
    })
    expect(state.lifecycle.phase).toBe('suspended')
    if (state.lifecycle.phase !== 'suspended') return
    expect(state.lifecycle.reasons).toEqual([
      'staleSignal',
      'hidden',
      'disconnect',
    ])
    state = apply(state, connected(5_300))
    state = apply(state, {
      type: 'visibility',
      occurredAt: 5_400,
      state: 'visible',
    })
    expect(state.lifecycle.phase).toBe('suspended')
    if (state.lifecycle.phase === 'suspended') {
      expect(state.lifecycle.reasons).toEqual(['staleSignal'])
    }
  })

  it('rejects out-of-order facts and preserves monotonic diagnostics', () => {
    let state = createWarmupFlowState(true)
    state = apply(state, connected(100), 1)
    state = apply(
      state,
      { type: 'status', occurredAt: 200, status: { state: 'connecting' } },
      2,
    )
    state = apply(state, sample(150, 111), 3)

    expect(state.latestPreMissionBpm).toBeNull()
    expect(state.lastAppliedOccurrenceTimeMs).toBe(200)
    expect(state.lastAppliedSequence).toBe(2)
    expect(state.diagnosticLog.at(-1)).toMatchObject({
      category: 'ignoredOutOfOrderFact',
      occurrenceTimeMs: 100,
      details: { factType: 'sample', occurrenceTimeMs: 150 },
    })
    expect(
      state.diagnosticLog.map(({ occurrenceTimeMs }) => occurrenceTimeMs),
    ).toEqual(
      [...state.diagnosticLog]
        .map(({ occurrenceTimeMs }) => occurrenceTimeMs)
        .sort((a, b) => a - b),
    )
  })

  it('accepts equal-time facts in increasing sequence order', () => {
    let state = createWarmupFlowState(true)
    state = apply(state, connected(100), 1)
    state = apply(
      state,
      { type: 'status', occurredAt: 100, status: { state: 'connecting' } },
      2,
    )
    expect(state.telemetryStatus.state).toBe('connecting')
    expect(state.lastAppliedOccurrenceTimeMs).toBe(100)
    expect(state.lastAppliedSequence).toBe(2)
  })

  it('invalidates on hidden and requires fresh recovery', () => {
    let state = run([connected(), begin(), sample(0, 110)])
    state = apply(state, {
      type: 'visibility',
      occurredAt: 100,
      state: 'hidden',
    })
    expect(state.lifecycle.phase).toBe('suspended')
    state = apply(state, {
      type: 'visibility',
      occurredAt: 200,
      state: 'visible',
    })
    expect(state.lifecycle.phase).toBe('warming')
    if (state.lifecycle.phase === 'warming')
      expect(state.lifecycle.warmup.classifier.filterSamples).toHaveLength(0)
  })

  it('reconnects into a fresh warm-up without restoring old qualification', () => {
    let state = run([
      connected(),
      begin(),
      ...sustainedOperationalSamples(13_000),
      {
        type: 'status',
        occurredAt: 13_500,
        status: { state: 'disconnected' },
      },
    ])
    expect(state.lifecycle.phase).toBe('suspended')
    state = apply(state, connected(14_000))
    expect(state.lifecycle.phase).toBe('warming')
    if (state.lifecycle.phase === 'warming') {
      expect(state.lifecycle.warmup.warmup.phase).toBe('warming')
      expect(state.lifecycle.warmup.classifier.filterSamples).toHaveLength(0)
    }
  })

  it.each([
    ['ordered bounds', '140', '100'],
    ['product minimum', '39', '140'],
    ['product maximum', '100', '221'],
  ])('rejects invalid target range: %s', (_name, lower, upper) => {
    let state = createWarmupFlowState()
    state = apply(state, {
      type: 'targetDraftChanged',
      occurredAt: 0,
      field: 'lower',
      value: lower,
    })
    state = apply(state, {
      type: 'targetDraftChanged',
      occurredAt: 0,
      field: 'upper',
      value: upper,
    })
    state = apply(state, {
      type: 'targetCommitted',
      occurredAt: 0,
    })
    expect(state.targetError).not.toBeNull()
  })

  it('accepts the exact product target boundaries', () => {
    let state = createWarmupFlowState()
    state = apply(state, {
      type: 'targetDraftChanged',
      occurredAt: 0,
      field: 'lower',
      value: '40',
    })
    state = apply(state, {
      type: 'targetDraftChanged',
      occurredAt: 0,
      field: 'upper',
      value: '220',
    })
    state = apply(state, {
      type: 'targetCommitted',
      occurredAt: 0,
    })
    expect(state.targetError).toBeNull()
    expect(state.targetRange).toEqual({ lowerBpm: 40, upperBpm: 220 })
  })

  it('does not announce every valid BPM sample', () => {
    let state = run([connected(), begin()])
    const announcement = state.announcement
    state = apply(state, sample(0, 110))
    state = apply(state, sample(500, 111))
    expect(state.announcement).toBe(announcement)
  })

  it('invalidates countdown on an invalid source status', () => {
    let state = run([
      connected(),
      begin(),
      ...sustainedOperationalSamples(13_000),
    ])
    expect(state.lifecycle.phase).toBe('countdown')
    state = apply(state, {
      type: 'status',
      occurredAt: 13_500,
      status: {
        state: 'error',
        error: {
          code: 'malformed-measurement',
          message: 'Malformed signal',
        },
      },
    })
    expect(state.lifecycle.phase).toBe('warming')
    if (state.lifecycle.phase === 'warming') {
      expect(state.lifecycle.warmup.classifier.lastInvalidationReason).toBe(
        'invalidSignal',
      )
      expect(state.lifecycle.warmup.warmup.operationalSinceMs).toBeNull()
    }
  })

  it('keeps domain calculations out of presentation and lifecycle reducer modules', async () => {
    const [preMission, warmup, reducer] = await Promise.all([
      import('../features/PreMissionScreen.tsx?raw'),
      import('../features/WarmupScreen.tsx?raw'),
      import('./appReducer.ts?raw'),
    ])
    for (const source of [
      preMission.default,
      warmup.default,
      reducer.default,
    ]) {
      expect(source).not.toMatch(/transitionClassifier|transitionWarmup/)
    }
  })

  it('surfaces chooser cancellation and permission denial as retryable status', () => {
    for (const code of ['chooser-cancelled', 'permission-denied'] as const) {
      const state = run([
        {
          type: 'status',
          occurredAt: 0,
          status: {
            state: 'error',
            error: { code, message: 'Retryable problem' },
          },
        },
      ])
      expect(state.telemetryStatus.state).toBe('error')
      expect(state.announcement).toBe('Retryable problem')
    }
  })
})
