import { describe, expect, it } from 'vitest'

import {
  defaultGameplayTuning,
  type GameplayTuning,
} from '../../config/gameplayTuning'
import {
  deserializeMissionResult,
  serializeMissionResult,
} from './MissionResult'
import {
  advanceMissionSession,
  createMissionSessionState,
  requireMissionResult,
  type MissionSessionState,
} from './missionSession'
import type { MissionSessionFact } from './missionStatistics'

const targetRange = { lowerBpm: 100, upperBpm: 140 }
const tuning = defaultGameplayTuning
const permissiveTuning: GameplayTuning = {
  ...tuning,
  missionStatistics: {
    minimumValidSampleCount: 1,
    minimumUsableDurationMs: 1,
  },
}

const time = (
  occurrenceTimeMs: number,
  sequence: number,
): MissionSessionFact => ({
  type: 'timeAdvanced',
  occurrenceTimeMs,
  sequence,
})

const classifier = (
  occurrenceTimeMs: number,
  sequence: number,
  stableClassification: 'below' | 'operational' | 'above' | null,
  signalQuality: 'insufficient' | 'usable' | 'stale' | 'invalid' = 'usable',
): MissionSessionFact => ({
  type: 'classifierUpdated',
  occurrenceTimeMs,
  sequence,
  signalQuality,
  stableClassification,
})

const sample = (
  occurrenceTimeMs: number,
  sequence: number,
  bpm: number,
): MissionSessionFact => ({
  type: 'heartRateSample',
  occurrenceTimeMs,
  sequence,
  bpm,
})

const suspension = (
  occurrenceTimeMs: number,
  sequence: number,
  suspended: boolean,
  disconnected = false,
): MissionSessionFact => ({
  type: 'lifecycleProjectionChanged',
  occurrenceTimeMs,
  sequence,
  suspended,
  disconnected,
})

const rotate = (
  occurrenceTimeMs: number,
  sequence: number,
): MissionSessionFact => ({
  type: 'puzzleTileRotated',
  occurrenceTimeMs,
  sequence,
})

const hint = (
  occurrenceTimeMs: number,
  sequence: number,
): MissionSessionFact => ({
  type: 'puzzleHintRequested',
  occurrenceTimeMs,
  sequence,
})

const reset = (
  occurrenceTimeMs: number,
  sequence: number,
): MissionSessionFact => ({
  type: 'puzzleReset',
  occurrenceTimeMs,
  sequence,
})

const complete = (
  occurrenceTimeMs: number,
  sequence: number,
): MissionSessionFact => ({
  type: 'puzzleCompleted',
  occurrenceTimeMs,
  sequence,
})

function run(
  facts: readonly MissionSessionFact[],
  gameplayTuning: GameplayTuning = tuning,
): MissionSessionState {
  let state = createMissionSessionState(0, targetRange, gameplayTuning)
  for (const fact of facts) {
    state = advanceMissionSession(state, fact, gameplayTuning)
  }
  return state
}

describe('mission result finalization and heart-rate statistics', () => {
  it('rejects result access before authoritative mission finalization', () => {
    expect(() =>
      requireMissionResult(createMissionSessionState(0, targetRange, tuning)),
    ).toThrow(/before finalization/)
  })

  it('represents a run with no qualifying samples explicitly', () => {
    const result = requireMissionResult(
      run([classifier(0, 1, 'operational'), complete(5_000, 2)]),
    )
    expect(result).toMatchObject({
      validSampleCount: 0,
      minimumBpm: null,
      averageBpm: null,
      peakBpm: null,
      operationalDurationMs: 5_000,
    })
  })

  it('retains one valid sample but suppresses a sparse average', () => {
    const result = requireMissionResult(
      run([
        sample(0, 1, 123),
        classifier(0, 2, 'operational'),
        complete(5_000, 3),
      ]),
    )
    expect(result).toMatchObject({
      validSampleCount: 1,
      minimumBpm: 123,
      averageBpm: null,
      peakBpm: 123,
    })
  })

  it('calculates a fractional time-weighted average, minimum, and peak', () => {
    const result = requireMissionResult(
      run([
        sample(0, 1, 100),
        classifier(0, 2, 'operational'),
        sample(1_000, 3, 160),
        sample(2_500, 4, 130),
        complete(5_000, 5),
      ]),
    )
    expect(result).toMatchObject({
      validSampleCount: 3,
      minimumBpm: 100,
      averageBpm: 133,
      peakBpm: 160,
      operationalPercentage: 100,
    })
  })

  it('keeps a genuinely fractional average without presentation rounding', () => {
    const result = requireMissionResult(
      run(
        [
          sample(0, 1, 100),
          classifier(0, 2, 'operational'),
          sample(1_000, 3, 101),
          complete(3_000, 4),
        ],
        permissiveTuning,
      ),
    )
    expect(result.averageBpm).toBeCloseTo(100 + 2 / 3, 12)
  })

  it('excludes invalid, implausible, and suspended samples', () => {
    const result = requireMissionResult(
      run(
        [
          sample(0, 1, Number.NaN),
          sample(1, 2, 0),
          sample(2, 3, 29),
          sample(3, 4, 241),
          sample(4, 5, 120.5),
          sample(5, 6, 120),
          suspension(10, 7, true),
          sample(20, 8, 130),
          complete(30, 9),
        ],
        permissiveTuning,
      ),
    )
    expect(result).toMatchObject({
      validSampleCount: 1,
      minimumBpm: 120,
      peakBpm: 120,
    })
  })

  it('orders equal-time samples by sequence for later weighted coverage', () => {
    const result = requireMissionResult(
      run(
        [
          sample(0, 1, 100),
          sample(0, 2, 200),
          classifier(0, 3, 'operational'),
          complete(4_000, 4),
        ],
        permissiveTuning,
      ),
    )
    expect(result).toMatchObject({
      validSampleCount: 2,
      minimumBpm: 100,
      averageBpm: 200,
      peakBpm: 200,
    })
  })

  it('does not infer BPM coverage through unusable or suspended gaps', () => {
    const result = requireMissionResult(
      run(
        [
          sample(0, 1, 100),
          classifier(0, 2, 'operational'),
          classifier(1_000, 3, null, 'stale'),
          sample(2_000, 4, 200),
          classifier(3_000, 5, 'operational'),
          suspension(4_000, 6, true),
          suspension(5_000, 7, false),
          complete(6_000, 8),
        ],
        permissiveTuning,
      ),
    )
    expect(result.averageBpm).toBe(150)
    expect(result.unusableSignalDurationMs).toBe(2_000)
    expect(result.suspendedDurationMs).toBe(1_000)
  })

  it('ignores samples and every other fact after finalization', () => {
    const finalized = run([
      sample(0, 1, 120),
      classifier(0, 2, 'operational'),
      complete(5_000, 3),
    ])
    const later = advanceMissionSession(
      finalized,
      sample(6_000, 4, 200),
      tuning,
    )
    expect(later).toBe(finalized)
    expect(later.result).toBe(finalized.result)
  })

  it('delegates stale and duplicate ordering rejection to Gate 7A', () => {
    const state = run([time(1_000, 10)])
    expect(() =>
      advanceMissionSession(state, sample(999, 11, 120), tuning),
    ).toThrow(RangeError)
    expect(() =>
      advanceMissionSession(state, rotate(1_000, 10), tuning),
    ).toThrow(RangeError)
  })
})

describe('classified, gap, suspension, and episode metrics', () => {
  it('consumes Gate 7A behavior so suspended intervals cannot accrue classified time', () => {
    const state = run([
      classifier(0, 1, 'below'),
      suspension(1_000, 2, true),
      classifier(2_000, 3, 'above'),
      time(3_000, 4),
      suspension(4_000, 5, false),
      complete(5_000, 6),
    ])
    const result = requireMissionResult(state)
    expect(result).toMatchObject({
      belowRangeDurationMs: 1_000,
      aboveRangeDurationMs: 1_000,
      suspendedDurationMs: 3_000,
      activeDurationMs: 2_000,
      endingStability: 95,
    })
    expect(result.lowOutputEpisodeCount).toBe(1)
    expect(result.overloadEpisodeCount).toBe(0)
  })

  it('closes exact fractional classification and gap segments once', () => {
    const result = requireMissionResult(
      run([
        classifier(0, 1, 'below'),
        classifier(1_000.25, 2, 'operational'),
        classifier(2_500.75, 3, 'above'),
        classifier(4_000.5, 4, null),
        classifier(5_000.125, 5, null, 'stale'),
        suspension(6_000.625, 6, true),
        suspension(8_000.875, 7, false),
        classifier(9_000.5, 8, 'operational'),
        complete(10_000.25, 9),
      ]),
    )
    expect(result).toMatchObject({
      missionDurationMs: 10_000.25,
      activeDurationMs: 5_000.25,
      belowRangeDurationMs: 1_000.25,
      operationalDurationMs: 2_500.25,
      aboveRangeDurationMs: 1_499.75,
      unclassifiedDurationMs: 999.625,
      unusableSignalDurationMs: 2_000.125,
      suspendedDurationMs: 2_000.25,
    })
    expect(
      result.activeDurationMs +
        result.unclassifiedDurationMs +
        result.unusableSignalDurationMs +
        result.suspendedDurationMs,
    ).toBe(result.missionDurationMs)
  })

  it('counts entries, persistence, exits, re-entry, and invalidation baselines', () => {
    const result = requireMissionResult(
      run([
        classifier(0, 1, 'below'),
        classifier(100, 2, 'below'),
        classifier(200, 3, 'operational'),
        classifier(300, 4, 'below'),
        classifier(400, 5, 'above'),
        classifier(500, 6, 'operational'),
        classifier(600, 7, 'above'),
        classifier(700, 8, null, 'stale'),
        classifier(800, 9, 'below'),
        classifier(900, 10, 'operational'),
        classifier(1_000, 11, 'below'),
        complete(1_100, 12),
      ]),
    )
    expect(result).toMatchObject({
      lowOutputEpisodeCount: 3,
      overloadEpisodeCount: 2,
    })
  })

  it('uses equal-time sequence transitions without inventing duration', () => {
    const result = requireMissionResult(
      run([
        classifier(0, 1, 'below'),
        classifier(0, 2, 'operational'),
        classifier(0, 3, 'above'),
        complete(1_000, 4),
      ]),
    )
    expect(result).toMatchObject({
      belowRangeDurationMs: 0,
      operationalDurationMs: 0,
      aboveRangeDurationMs: 1_000,
      lowOutputEpisodeCount: 1,
      overloadEpisodeCount: 1,
    })
  })

  it('does not turn suspension and resume into classification episodes', () => {
    const result = requireMissionResult(
      run([
        classifier(0, 1, 'operational'),
        suspension(1_000, 2, true),
        suspension(2_000, 3, false),
        complete(3_000, 4),
      ]),
    )
    expect(result).toMatchObject({
      lowOutputEpisodeCount: 0,
      overloadEpisodeCount: 0,
      operationalDurationMs: 2_000,
      suspendedDurationMs: 1_000,
    })
  })

  it.each([
    ['below', 'lowOutputEpisodeCount'],
    ['above', 'overloadEpisodeCount'],
  ] as const)(
    'uses suspended %s establishment as a non-counting baseline',
    (qualifyingClassification, countField) => {
      const result = requireMissionResult(
        run([
          suspension(1_000, 1, true),
          classifier(2_000, 2, qualifyingClassification),
          suspension(3_000, 3, false),
          classifier(4_000, 4, 'operational'),
          classifier(5_000, 5, qualifyingClassification),
          complete(6_000, 6),
        ]),
      )
      expect(result[countField]).toBe(1)
    },
  )

  it.each(['before', 'after'] as const)(
    'does not count re-establishment %s resume after suspended invalidation',
    (placement) => {
      const facts: MissionSessionFact[] = [
        classifier(0, 1, 'operational'),
        suspension(1_000, 2, true),
        classifier(2_000, 3, null, 'stale'),
      ]
      if (placement === 'before') {
        facts.push(classifier(3_000, 4, 'below'), suspension(4_000, 5, false))
      } else {
        facts.push(suspension(3_000, 4, false), classifier(4_000, 5, 'below'))
      }
      facts.push(
        classifier(5_000, 6, 'operational'),
        classifier(6_000, 7, 'below'),
        complete(7_000, 8),
      )
      const result = requireMissionResult(run(facts))
      expect(result.lowOutputEpisodeCount).toBe(1)
    },
  )
})

describe('pause and disconnect lifecycle-projection metrics', () => {
  it('retains aggregate disconnect state without owning lifecycle reasons', () => {
    const state = createMissionSessionState(0, targetRange, tuning)
    expect(state.statistics).not.toHaveProperty('suspensionReasons')
    expect(state.statistics).toMatchObject({ disconnected: false })
  })

  it('counts suspension unions and disconnect membership without overlap', () => {
    const result = requireMissionResult(
      run([
        suspension(1_000, 1, true),
        suspension(2_000, 2, true, true),
        suspension(3_000, 3, true, true),
        suspension(4_000, 4, true, true),
        suspension(5_000, 5, true),
        suspension(6_000, 6, false),
        suspension(7_000, 7, true, true),
        suspension(8_000, 8, true, true),
        suspension(9_000, 9, true),
        complete(10_000, 10),
      ]),
    )
    expect(result).toMatchObject({
      pauseCount: 2,
      suspendedDurationMs: 8_000,
      disconnectCount: 2,
      disconnectedDurationMs: 5_000,
      unusableSignalDurationMs: 2_000,
    })
  })

  it('closes an open disconnect exactly at finalization', () => {
    const result = requireMissionResult(
      run([suspension(1_000, 1, true, true), complete(4_500.5, 2)]),
    )
    expect(result).toMatchObject({
      pauseCount: 1,
      disconnectCount: 1,
      suspendedDurationMs: 3_500.5,
      disconnectedDurationMs: 3_500.5,
    })
  })

  it('rejects impossible or non-boolean projections before advancing Gate 7A', () => {
    const state = createMissionSessionState(0, targetRange, tuning)
    expect(() =>
      advanceMissionSession(state, suspension(1_000, 1, false, true), tuning),
    ).toThrow(RangeError)
    expect(() =>
      advanceMissionSession(
        state,
        {
          type: 'lifecycleProjectionChanged',
          occurrenceTimeMs: 1_000,
          sequence: 1,
          suspended: 'yes' as unknown as boolean,
          disconnected: false,
        },
        tuning,
      ),
    ).toThrow(RangeError)
  })
})

describe('puzzle facts and authoritative outcomes', () => {
  it('counts rotations, records useful hint display, and finalizes success', () => {
    const state = run([
      rotate(100, 1),
      rotate(200, 2),
      rotate(300, 3),
      hint(400, 4),
      complete(1_000, 5),
      rotate(1_000, 6),
      complete(1_000, 7),
    ])
    const result = requireMissionResult(state)
    expect(result).toMatchObject({
      outcome: 'success',
      puzzleMoveCount: 3,
      hintUsed: true,
      puzzleCompleted: true,
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.targetRange)).toBe(true)
  })

  it('keeps moves and hint use cumulative across puzzle reset', () => {
    const result = requireMissionResult(
      run([
        rotate(100, 1),
        hint(200, 2),
        reset(300, 3),
        rotate(400, 4),
        complete(1_000, 5),
      ]),
    )
    expect(result).toMatchObject({
      puzzleMoveCount: 2,
      hintUsed: true,
      puzzleCompleted: true,
    })
  })

  it('copies failure, final stability, time, and active duration from Gate 7A', () => {
    const state = run([
      classifier(0, 1, 'above'),
      rotate(10_000, 2),
      time(40_000, 3),
      complete(40_000, 4),
    ])
    const result = requireMissionResult(state)
    expect(result).toMatchObject({
      outcome: 'failure',
      endingStability: 0,
      activeDurationMs: 100_000 / 3,
      finalizedAtTimeMs: 100_000 / 3,
      puzzleMoveCount: 1,
      puzzleCompleted: false,
    })
    expect(result.outcome).toBe(
      state.mission.status.phase === 'finalized'
        ? state.mission.status.outcome
        : null,
    )
    expect(result.activeDurationMs).toBe(state.mission.activeElapsedTimeMs)
    expect(result.endingStability).toBe(state.mission.stability)
  })

  it('does not apply a statistics fact preempted by earlier failure', () => {
    const result = requireMissionResult(
      run([classifier(0, 1, 'above'), sample(40_000, 2, 180)]),
    )
    expect(result).toMatchObject({
      outcome: 'failure',
      validSampleCount: 0,
      peakBpm: null,
    })
  })

  it('preserves exact-boundary Gate 7A precedence for statistics facts', () => {
    const wakeFirst = requireMissionResult(
      run([classifier(0, 1, 'below'), time(50_000, 2), complete(50_000, 3)]),
    )
    const completionFirst = requireMissionResult(
      run([classifier(0, 1, 'below'), complete(50_000, 2), time(50_000, 3)]),
    )
    expect(wakeFirst.outcome).toBe('failure')
    expect(completionFirst.outcome).toBe('success')
  })
})

describe('scheduler partition independence and deterministic replay', () => {
  function partitionedResult(wakeTimes: readonly number[]): string {
    const facts: MissionSessionFact[] = [
      sample(0, 1, 110),
      classifier(0, 2, 'operational'),
      sample(1_000.25, 10, 130),
      classifier(2_000.5, 20, 'below'),
      sample(3_000.75, 30, 150),
    ]
    facts.push(
      ...wakeTimes.map((wakeTime, index) => time(wakeTime, 100 + index)),
      complete(10_000, 100_000),
    )
    return serializeMissionResult(requireMissionResult(run(facts)))
  }

  it('matches one large wake, irregular fractional wakes, and many small wakes', () => {
    const oneWake = partitionedResult([9_000])
    expect(partitionedResult([3_001.125, 4_444.444, 7_777.777, 9_000])).toBe(
      oneWake,
    )
    expect(
      partitionedResult(
        Array.from({ length: 599 }, (_value, index) => 3_010 + index * 10),
      ),
    ).toBe(oneWake)
  })

  it('replays the same ordered script to byte-identical serialized output', () => {
    const facts = [
      sample(0, 1, 100),
      classifier(0, 2, 'below'),
      rotate(500, 3),
      suspension(1_000, 4, true, true),
      suspension(2_000, 5, true),
      suspension(3_000, 6, false),
      classifier(3_000, 7, 'operational'),
      sample(3_000, 8, 120),
      hint(3_500, 9),
      complete(8_000, 10),
    ] as const
    const first = serializeMissionResult(requireMissionResult(run(facts)))
    const second = serializeMissionResult(requireMissionResult(run(facts)))
    expect(second).toBe(first)
    expect(deserializeMissionResult(first)).toEqual(
      requireMissionResult(run(facts)),
    )
  })
})
