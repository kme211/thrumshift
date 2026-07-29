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

function enterActiveMission(): WarmupFlowState {
  return run([
    connected(),
    begin(),
    ...sustainedOperationalSamples(13_000),
    advance(16_000),
  ])
}

function activeMissionWithFreshSamples(
  bpm: number,
  endTime = 22_000,
): WarmupFlowState {
  let state = enterActiveMission()
  for (let time = 17_000; time <= endTime; time += 1_000) {
    state = apply(state, sample(time, bpm))
  }
  return state
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

  it('creates one canonical active run and advances mission, statistics, classifier, and puzzle together', () => {
    let state = run([
      connected(),
      begin(),
      ...sustainedOperationalSamples(13_000),
      advance(16_000),
    ])
    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    const originalRun = state.lifecycle.mission
    expect(originalRun.session.mission.stableClassification).toBe(
      originalRun.classifier.stableClassification,
    )

    state = apply(state, {
      type: 'puzzleTileRotated',
      occurredAt: 16_100,
      tileId: 'top-straight',
    })
    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    expect(state.lifecycle.mission).not.toBe(originalRun)
    expect(state.lifecycle.mission.session.statistics.puzzleMoveCount).toBe(1)
    expect(state.lifecycle.mission.puzzle.orientations['top-straight']).toBe(1)
  })

  it('freezes canonical active time and puzzle input during manual pause, then resumes retained state', () => {
    let state = run([
      connected(),
      begin(),
      ...sustainedOperationalSamples(13_000),
      advance(16_000),
    ])
    state = apply(state, { type: 'manualPause', occurredAt: 17_000 })
    expect(state.lifecycle.phase).toBe('suspended')
    if (
      state.lifecycle.phase !== 'suspended' ||
      state.lifecycle.resumeTarget.phase !== 'activeMission'
    )
      return
    const pausedRun = state.lifecycle.resumeTarget.mission
    const pausedElapsed = pausedRun.session.mission.activeElapsedTimeMs
    const orientation = pausedRun.puzzle.orientations['top-straight']

    state = apply(state, {
      type: 'puzzleTileRotated',
      occurredAt: 25_000,
      tileId: 'top-straight',
    })
    state = apply(state, {
      type: 'timeAdvanced',
      occurredAt: 25_500,
      runGeneration: 1,
    })
    if (
      state.lifecycle.phase !== 'suspended' ||
      state.lifecycle.resumeTarget.phase !== 'activeMission'
    )
      return
    expect(
      state.lifecycle.resumeTarget.mission.puzzle.orientations['top-straight'],
    ).toBe(orientation)
    expect(
      state.lifecycle.resumeTarget.mission.session.mission.activeElapsedTimeMs,
    ).toBe(pausedElapsed)

    state = apply(state, { type: 'manualResume', occurredAt: 26_000 })
    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    expect(state.lifecycle.mission.session.mission.activeElapsedTimeMs).toBe(
      pausedElapsed,
    )
    expect(state.lifecycle.mission.session.statistics.pauseCount).toBe(1)
  })

  it('keeps reset metrics cumulative and finalizes success only through ordered puzzle completion', () => {
    let state = run([
      connected(),
      begin(),
      ...sustainedOperationalSamples(13_000),
      advance(16_000),
    ])
    state = apply(state, {
      type: 'puzzleTileRotated',
      occurredAt: 16_100,
      tileId: 'top-straight',
    })
    state = apply(state, { type: 'puzzleReset', occurredAt: 16_200 })
    state = apply(state, {
      type: 'puzzleTileRotated',
      occurredAt: 16_300,
      tileId: 'top-straight',
    })
    state = apply(state, {
      type: 'puzzleTileRotated',
      occurredAt: 16_400,
      tileId: 'middle-corner-left',
    })
    state = apply(state, {
      type: 'puzzleTileRotated',
      occurredAt: 16_500,
      tileId: 'bottom-straight',
    })

    expect(state.lifecycle.phase).toBe('result')
    if (state.lifecycle.phase !== 'result') return
    expect(state.lifecycle.result).toMatchObject({
      outcome: 'success',
      puzzleMoveCount: 4,
      puzzleCompleted: true,
    })
    const finalized = state.lifecycle
    state = apply(state, {
      type: 'timeAdvanced',
      occurredAt: 50_000,
      runGeneration: 1,
    })
    expect(state.lifecycle).toBe(finalized)
  })

  it('lets authoritative failure preempt later puzzle input without changing puzzle statistics', () => {
    let state = enterActiveMission()
    for (let time = 17_000; time <= 54_000; time += 1_000) {
      state = apply(state, sample(time, 170))
    }
    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    expect(state.lifecycle.mission.classifier.stableClassification).toBe(
      'above',
    )
    expect(state.lifecycle.mission.session.mission.stability).toBe(1)
    state = apply(state, {
      type: 'puzzleTileRotated',
      occurredAt: 55_000,
      tileId: 'top-straight',
    })
    expect(state.lifecycle.phase).toBe('result')
    if (state.lifecycle.phase !== 'result') return
    expect(state.lifecycle.result.outcome).toBe('failure')
    expect(state.lifecycle.result.endingStability).toBe(0)
    expect(state.lifecycle.result.puzzleMoveCount).toBe(0)
    const result = state.lifecycle.result
    state = apply(state, {
      type: 'puzzleTileRotated',
      occurredAt: 81_000,
      tileId: 'top-straight',
    })
    if (state.lifecycle.phase === 'result')
      expect(state.lifecycle.result).toBe(result)
  })

  it('announces a decreasing trend once without changing the announcement on each stability tick or frozen wake', () => {
    let state = activeMissionWithFreshSamples(170)
    expect(state.lifecycle.phase).toBe('activeMission')
    expect(state.announcement).toBe(
      'Heart rate is above range. Station stability is decreasing',
    )
    const decreasingAnnouncement = state.announcement

    state = apply(state, sample(23_000, 170))
    state = apply(state, sample(24_000, 170))
    expect(state.lifecycle.phase).toBe('activeMission')
    expect(state.announcement).toBe(decreasingAnnouncement)

    state = apply(state, { type: 'manualPause', occurredAt: 24_500 })
    expect(state.announcement).toBe('Mission paused')
    state = apply(state, advance(25_000))
    expect(state.announcement).toBe('Mission paused')
  })

  it('announces recovering and holding once when those stability trends begin', () => {
    let state = activeMissionWithFreshSamples(170)
    for (let time = 23_000; time <= 27_000; time += 1_000) {
      state = apply(state, sample(time, 110))
    }
    expect(state.lifecycle.phase).toBe('activeMission')
    expect(state.announcement).toBe(
      'Heart rate is operational. Station stability is recovering',
    )
    const recoveringAnnouncement = state.announcement

    state = apply(state, sample(28_000, 110))
    expect(state.announcement).toBe(recoveringAnnouncement)

    for (let time = 29_000; time <= 46_000; time += 1_000) {
      state = apply(state, sample(time, 110))
    }
    expect(state.lifecycle.phase).toBe('activeMission')
    expect(state.announcement).toBe('Station stability is holding')
    const holdingAnnouncement = state.announcement
    state = apply(state, sample(47_000, 110))
    expect(state.announcement).toBe(holdingAnnouncement)
  })

  it('announces each established stability threshold once and leaves failure to the focused result transition', () => {
    let state = enterActiveMission()
    let previousAnnouncement = state.announcement
    const announcements: string[] = []

    for (let time = 17_000; time <= 55_000; time += 1_000) {
      state = apply(state, sample(time, 170))
      if (state.announcement !== previousAnnouncement) {
        announcements.push(state.announcement)
        previousAnnouncement = state.announcement
      }
    }

    expect(announcements).toEqual([
      'Heart rate is above range. Station stability is decreasing',
      'Station stability warning: 75 percent',
      'Station stability critical: 50 percent',
      'Station stability critical: 25 percent',
    ])
    expect(state.lifecycle.phase).toBe('result')
    if (state.lifecycle.phase === 'result') {
      expect(state.lifecycle.result.outcome).toBe('failure')
    }
  })

  it('advances signal authority before a rotation and freezes timing and stability at the exact stale deadline', () => {
    let state = activeMissionWithFreshSamples(170)
    state = apply(state, {
      type: 'puzzleTileRotated',
      occurredAt: 26_000,
      tileId: 'top-straight',
    })

    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    const run = state.lifecycle.mission
    expect(run.classifier.signalQuality).toBe('stale')
    expect(run.session.mission).toMatchObject({
      lastProcessedTimeMs: 26_000,
      activeElapsedTimeMs: 4_000,
      stability: 88,
      signalQuality: 'stale',
      stableClassification: null,
    })
    expect(run.session.statistics.completedDurationsMs.aboveRange).toBe(4_000)
    expect(run.session.statistics.durationSegment).toEqual({
      behavior: 'unusableSignal',
      startedAtTimeMs: 25_000,
    })
    expect(run.session.statistics.puzzleMoveCount).toBe(1)
  })

  it('orders stale authority before equal-time puzzle facts', () => {
    let state = activeMissionWithFreshSamples(170)
    state = apply(state, {
      type: 'puzzleTileRotated',
      occurredAt: 25_000,
      tileId: 'top-straight',
    })

    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    const run = state.lifecycle.mission
    expect(run.session.mission).toMatchObject({
      lastProcessedTimeMs: 25_000,
      activeElapsedTimeMs: 4_000,
      stability: 88,
      signalQuality: 'stale',
    })
    expect(run.session.statistics.durationSegment).toEqual({
      behavior: 'unusableSignal',
      startedAtTimeMs: 25_000,
    })
    expect(run.session.statistics.puzzleMoveCount).toBe(1)
  })

  it('cannot complete the puzzle ahead of an earlier unusable transition', () => {
    let state = activeMissionWithFreshSamples(170)
    for (const [occurredAt, tileId] of [
      [26_000, 'top-straight'],
      [27_000, 'middle-corner-left'],
      [28_000, 'bottom-straight'],
    ] as const) {
      state = apply(state, {
        type: 'puzzleTileRotated',
        occurredAt,
        tileId,
      })
    }

    expect(state.lifecycle.phase).toBe('result')
    if (state.lifecycle.phase !== 'result') return
    expect(state.lifecycle.result).toMatchObject({
      outcome: 'success',
      activeDurationMs: 4_000,
      aboveRangeDurationMs: 4_000,
      unusableSignalDurationMs: 6_000,
      puzzleMoveCount: 3,
      puzzleCompleted: true,
      endingStability: 88,
    })
  })

  it('orders a hint request after stale authority while retaining Gate 8A interaction policy', () => {
    let state = activeMissionWithFreshSamples(110, 30_000)
    const priorGlobalAnnouncement = state.announcement
    state = apply(state, {
      type: 'puzzleHintRequested',
      occurredAt: 34_000,
    })

    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    const run = state.lifecycle.mission
    expect(run.classifier.signalQuality).toBe('stale')
    expect(run.session.mission.activeElapsedTimeMs).toBe(12_000)
    expect(run.session.statistics.completedDurationsMs.operational).toBe(12_000)
    expect(run.session.statistics.durationSegment).toEqual({
      behavior: 'unusableSignal',
      startedAtTimeMs: 33_000,
    })
    expect(run.session.statistics.hintUsed).toBe(true)
    expect(run.hint).not.toBeNull()
    expect(state.announcement).toBe(priorGlobalAnnouncement)
  })

  it('advances stale authority before reset and pause facts', () => {
    let resetState = activeMissionWithFreshSamples(170)
    resetState = apply(resetState, {
      type: 'puzzleReset',
      occurredAt: 26_000,
    })
    expect(resetState.lifecycle.phase).toBe('activeMission')
    if (resetState.lifecycle.phase === 'activeMission') {
      expect(resetState.lifecycle.mission.classifier.signalQuality).toBe(
        'stale',
      )
      expect(
        resetState.lifecycle.mission.session.statistics.durationSegment,
      ).toEqual({
        behavior: 'unusableSignal',
        startedAtTimeMs: 25_000,
      })
    }

    let pausedState = activeMissionWithFreshSamples(170)
    pausedState = apply(pausedState, {
      type: 'manualPause',
      occurredAt: 26_000,
    })
    expect(pausedState.lifecycle.phase).toBe('suspended')
    if (
      pausedState.lifecycle.phase !== 'suspended' ||
      pausedState.lifecycle.resumeTarget.phase !== 'activeMission'
    )
      return
    const run = pausedState.lifecycle.resumeTarget.mission
    expect(run.classifier).toMatchObject({
      signalQuality: 'insufficient',
      stableClassification: null,
      lastInvalidationReason: 'manualSuspension',
    })
    expect(run.session.mission).toMatchObject({
      activeElapsedTimeMs: 4_000,
      stability: 88,
      playState: 'suspended',
    })
    expect(run.session.statistics.completedDurationsMs).toMatchObject({
      aboveRange: 4_000,
      unusableSignal: 4_000,
    })
  })

  it('produces equivalent mission and statistics state for prompt and delayed scheduler scripts', () => {
    let prompt = activeMissionWithFreshSamples(170)
    prompt = apply(prompt, advance(25_000))
    prompt = apply(prompt, advance(26_000))

    let delayed = activeMissionWithFreshSamples(170)
    delayed = apply(delayed, advance(26_000))

    expect(prompt.lifecycle.phase).toBe('activeMission')
    expect(delayed.lifecycle.phase).toBe('activeMission')
    if (
      prompt.lifecycle.phase !== 'activeMission' ||
      delayed.lifecycle.phase !== 'activeMission'
    )
      return
    const promptMission = {
      ...prompt.lifecycle.mission.session.mission,
      lastProcessedSequence: 0,
    }
    const delayedMission = {
      ...delayed.lifecycle.mission.session.mission,
      lastProcessedSequence: 0,
    }
    expect(promptMission).toEqual(delayedMission)
    expect(prompt.lifecycle.mission.session.statistics).toEqual(
      delayed.lifecycle.mission.session.statistics,
    )
  })

  it('invalidates manual pause classification and requires fresh density and dwell after resume', () => {
    let state = activeMissionWithFreshSamples(110, 24_000)
    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    expect(state.lifecycle.mission.classifier.stableClassification).toBe(
      'operational',
    )

    state = apply(state, { type: 'manualPause', occurredAt: 25_000 })
    expect(state.lifecycle.phase).toBe('suspended')
    if (
      state.lifecycle.phase !== 'suspended' ||
      state.lifecycle.resumeTarget.phase !== 'activeMission'
    )
      return
    const retainedPuzzle = state.lifecycle.resumeTarget.mission.puzzle
    const retainedStatistics =
      state.lifecycle.resumeTarget.mission.session.statistics
    const pausedElapsed =
      state.lifecycle.resumeTarget.mission.session.mission.activeElapsedTimeMs
    expect(state.lifecycle.resumeTarget.mission.classifier).toMatchObject({
      latestValidBpm: 110,
      signalQuality: 'insufficient',
      stableClassification: null,
      candidateClassification: null,
      filterSamples: [],
      validSampleTimesMs: [],
      lastInvalidationReason: 'manualSuspension',
    })

    state = apply(state, { type: 'manualResume', occurredAt: 30_000 })
    if (state.lifecycle.phase !== 'activeMission') return
    const resumedRun = state.lifecycle.mission
    state = apply(state, {
      type: 'timeAdvanced',
      occurredAt: 30_500,
      runGeneration: 0,
    })
    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    expect(state.lifecycle.mission).toBe(resumedRun)
    state = apply(state, advance(31_000))
    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    expect(state.lifecycle.mission.classifier.stableClassification).toBeNull()
    expect(state.lifecycle.mission.session.mission.activeElapsedTimeMs).toBe(
      pausedElapsed,
    )
    expect(state.lifecycle.mission.session.mission.stability).toBe(100)
    expect(state.lifecycle.mission.puzzle).toBe(retainedPuzzle)
    expect(state.lifecycle.mission.session.statistics).toMatchObject({
      puzzleMoveCount: retainedStatistics.puzzleMoveCount,
      hintUsed: retainedStatistics.hintUsed,
      pauseCount: 1,
    })

    for (const time of [32_000, 33_000, 34_000, 35_000]) {
      state = apply(state, sample(time, 110))
    }
    if (state.lifecycle.phase !== 'activeMission') return
    expect(state.lifecycle.mission.classifier.stableClassification).toBeNull()
    expect(state.lifecycle.mission.session.mission.activeElapsedTimeMs).toBe(
      pausedElapsed,
    )

    state = apply(state, sample(36_000, 110))
    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    expect(state.lifecycle.mission.classifier.stableClassification).toBe(
      'operational',
    )
    expect(state.lifecycle.mission.session.mission.activeElapsedTimeMs).toBe(
      pausedElapsed,
    )
    state = apply(state, advance(37_000))
    if (state.lifecycle.phase === 'activeMission') {
      expect(state.lifecycle.mission.session.mission.activeElapsedTimeMs).toBe(
        pausedElapsed + 1_000,
      )
    }
  })

  it.each([
    ['below', 80],
    ['above', 170],
  ] as const)(
    'does not reuse a pre-pause %s-range classification across repeated pause and resume',
    (_classification, bpm) => {
      let state = activeMissionWithFreshSamples(bpm, 24_000)
      for (const [pauseAt, resumeAt] of [
        [25_000, 26_000],
        [27_000, 28_000],
      ] as const) {
        state = apply(state, { type: 'manualPause', occurredAt: pauseAt })
        state = apply(state, { type: 'manualResume', occurredAt: resumeAt })
        expect(state.lifecycle.phase).toBe('activeMission')
        if (state.lifecycle.phase !== 'activeMission') return
        expect(
          state.lifecycle.mission.classifier.stableClassification,
        ).toBeNull()
        expect(
          state.lifecycle.mission.session.mission.stableClassification,
        ).toBeNull()
      }
    },
  )

  it('orders a pause at the stale deadline as stale, invalidation, then suspension', () => {
    let state = activeMissionWithFreshSamples(170)
    state = apply(state, { type: 'manualPause', occurredAt: 25_000 })

    expect(state.lifecycle.phase).toBe('suspended')
    if (
      state.lifecycle.phase !== 'suspended' ||
      state.lifecycle.resumeTarget.phase !== 'activeMission'
    )
      return
    const run = state.lifecycle.resumeTarget.mission
    expect(run.classifier).toMatchObject({
      signalQuality: 'insufficient',
      stableClassification: null,
      lastInvalidationReason: 'manualSuspension',
    })
    expect(run.session.mission).toMatchObject({
      activeElapsedTimeMs: 4_000,
      stability: 88,
      playState: 'suspended',
    })
    expect(run.session.statistics.durationSegment).toEqual({
      behavior: 'suspended',
      startedAtTimeMs: 25_000,
    })
  })

  it('uses authoritative unsuspended active time for deterministic hint eligibility and preserves hint use across reset', () => {
    let state = run([
      connected(),
      begin(),
      ...sustainedOperationalSamples(13_000),
      advance(16_000),
    ])
    state = apply(state, { type: 'manualPause', occurredAt: 17_000 })
    state = apply(state, { type: 'manualResume', occurredAt: 27_000 })
    for (let time = 28_000; time <= 42_000; time += 1_000) {
      state = apply(state, sample(time, 110))
    }
    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    expect(
      state.lifecycle.mission.session.mission.activeElapsedTimeMs,
    ).toBeGreaterThanOrEqual(10_000)

    state = apply(state, { type: 'puzzleHintRequested', occurredAt: 42_000 })
    expect(state.lifecycle.phase).toBe('activeMission')
    if (state.lifecycle.phase !== 'activeMission') return
    expect(state.lifecycle.mission.hint).toMatchObject({
      tileId: 'top-straight',
      row: 0,
      column: 1,
    })
    expect(state.lifecycle.mission.session.statistics.hintUsed).toBe(true)

    state = apply(state, { type: 'puzzleReset', occurredAt: 42_000 })
    if (state.lifecycle.phase !== 'activeMission') return
    expect(state.lifecycle.mission.hint).toBeNull()
    expect(state.lifecycle.mission.session.statistics.hintUsed).toBe(true)
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
