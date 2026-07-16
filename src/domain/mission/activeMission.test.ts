import { describe, expect, it, vi } from 'vitest'

import {
  defaultGameplayTuning,
  type StabilityTuning,
} from '../../config/gameplayTuning'
import {
  advanceMission,
  createActiveMissionState,
  type ActiveMissionState,
  type MissionFact,
} from './activeMission'

const tuning = defaultGameplayTuning.stability

const classifier = (
  occurrenceTimeMs: number,
  sequence: number,
  stableClassification: 'below' | 'operational' | 'above' | null,
  signalQuality: 'insufficient' | 'usable' | 'stale' | 'invalid' = 'usable',
): MissionFact => ({
  type: 'classifierUpdated',
  occurrenceTimeMs,
  sequence,
  signalQuality,
  stableClassification,
})

const time = (occurrenceTimeMs: number, sequence: number): MissionFact => ({
  type: 'timeAdvanced',
  occurrenceTimeMs,
  sequence,
})

const play = (
  occurrenceTimeMs: number,
  sequence: number,
  playState: 'active' | 'suspended',
): MissionFact => ({
  type: 'playStateChanged',
  occurrenceTimeMs,
  sequence,
  playState,
})

const puzzle = (occurrenceTimeMs: number, sequence: number): MissionFact => ({
  type: 'puzzleCompleted',
  occurrenceTimeMs,
  sequence,
})

function run(
  facts: readonly MissionFact[],
  stabilityTuning: StabilityTuning = tuning,
): ActiveMissionState {
  let state = createActiveMissionState(0, stabilityTuning)
  for (const fact of facts) {
    state = advanceMission(state, fact, stabilityTuning)
  }
  return state
}

describe('active mission state and stability', () => {
  it('creates one canonical timeline with safe, unclassified initial state', () => {
    expect(createActiveMissionState(12.5, tuning)).toEqual({
      lastProcessedTimeMs: 12.5,
      lastProcessedSequence: 0,
      activeElapsedTimeMs: 0,
      stability: 100,
      stabilitySegmentAnchor: {
        startedAtTimeMs: 12.5,
        stability: 100,
        activeElapsedTimeMs: 0,
      },
      playState: 'active',
      signalQuality: 'insufficient',
      stableClassification: null,
      status: { phase: 'ongoing' },
    })
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects invalid initial time %s',
    (initialTimeMs) => {
      expect(() => createActiveMissionState(initialTimeMs, tuning)).toThrow(
        RangeError,
      )
    },
  )

  it('accepts zero elapsed time without inventing mission effects', () => {
    const state = run([classifier(0, 1, 'below'), time(0, 2)])
    expect(state).toMatchObject({
      lastProcessedTimeMs: 0,
      activeElapsedTimeMs: 0,
      stability: 100,
      status: { phase: 'ongoing' },
    })
  })

  it('drains below range over fractional elapsed milliseconds', () => {
    const state = run([classifier(0, 1, 'below'), time(250.5, 2)])
    expect(state.activeElapsedTimeMs).toBe(250.5)
    expect(state.stability).toBeCloseTo(99.499, 12)
  })

  it('drains faster above range using the configured above rate', () => {
    const state = run([classifier(0, 1, 'above'), time(2_500, 2)])
    expect(state).toMatchObject({ activeElapsedTimeMs: 2_500 })
    expect(state.stability).toBe(92.5)
  })

  it('recovers operational stability and clamps it at the maximum', () => {
    const recoveryTuning = { ...tuning, initial: 99 }
    const state = run(
      [classifier(0, 1, 'operational'), time(5_000, 2)],
      recoveryTuning,
    )
    expect(state.stability).toBe(100)
    expect(state.stabilitySegmentAnchor).toEqual({
      startedAtTimeMs: 1_000,
      stability: 100,
      activeElapsedTimeMs: 1_000,
    })
    expect(state.status.phase).toBe('ongoing')
  })

  it('supports operational preservation when recovery is configured as zero', () => {
    const preserveTuning = {
      ...tuning,
      initial: 73,
      operationalRecoveryPerSecond: 0,
    }
    const state = run(
      [classifier(0, 1, 'operational'), time(7_250, 2)],
      preserveTuning,
    )
    expect(state.stability).toBe(73)
    expect(state.activeElapsedTimeMs).toBe(7_250)
  })

  it('handles very small deltas without rounding them away', () => {
    const state = run([classifier(0, 1, 'below'), time(0.001, 2)])
    expect(state.activeElapsedTimeMs).toBe(0.001)
    expect(state.stability).toBeCloseTo(99.999998, 12)
  })

  it('processes a large interval fully and finalizes at the derived boundary', () => {
    const state = run([classifier(0, 1, 'below'), time(1_000_000, 2)])
    expect(state).toMatchObject({
      lastProcessedTimeMs: 50_000,
      activeElapsedTimeMs: 50_000,
      stability: 0,
      status: {
        phase: 'finalized',
        outcome: 'failure',
        finalizedAtTimeMs: 50_000,
        finalizedBySequence: 2,
      },
    })
  })

  it('produces equivalent state across different scheduler wake-up sizes', () => {
    const recoveryTuning = { ...tuning, initial: 50 }
    const oneWake = run(
      [classifier(0, 1, 'operational'), time(20_000, 100)],
      recoveryTuning,
    )
    const manyWakes = run(
      [
        classifier(0, 1, 'operational'),
        time(1_000, 10),
        time(2_500, 20),
        time(7_000, 30),
        time(12_345.5, 40),
        time(20_000, 100),
      ],
      recoveryTuning,
    )
    expect(manyWakes).toEqual(oneWake)
  })

  it('is partition independent at the fractional failure boundary', () => {
    const partitions = [
      [50_000],
      [0.8, 50_000],
      [0.125, 17.75, 999.333, 7_654.321, 31_415.926, 50_000],
      Array.from({ length: 5_000 }, (_value, index) => (index + 1) * 10),
    ]
    const states = partitions.map((wakeTimes) =>
      run([
        classifier(0, 1, 'below'),
        ...wakeTimes.map((wakeTime, index) =>
          time(wakeTime, index === wakeTimes.length - 1 ? 100_000 : index + 2),
        ),
        puzzle(50_000, 100_001),
      ]),
    )

    for (const state of states) {
      expect(state).toEqual(states[0])
      expect(state).toMatchObject({
        stability: 0,
        activeElapsedTimeMs: 50_000,
        status: {
          phase: 'finalized',
          outcome: 'failure',
          finalizedAtTimeMs: 50_000,
          finalizedBySequence: 100_000,
        },
      })
    }
  })

  it('keeps puzzle-first boundary ordering partition independent', () => {
    const prefixes = [
      [],
      [0.8],
      [0.125, 17.75, 999.333, 7_654.321, 31_415.926],
      Array.from({ length: 4_999 }, (_value, index) => (index + 1) * 10),
    ]
    const states = prefixes.map((wakeTimes) =>
      run([
        classifier(0, 1, 'below'),
        ...wakeTimes.map((wakeTime, index) => time(wakeTime, index + 2)),
        puzzle(50_000, 100_000),
      ]),
    )

    for (const state of states) {
      expect(state).toEqual(states[0])
      expect(state).toMatchObject({
        stability: 0,
        status: {
          phase: 'finalized',
          outcome: 'success',
          finalizedAtTimeMs: 50_000,
          finalizedBySequence: 100_000,
        },
      })
    }
  })

  it.each([
    ['drain', tuning, 'below' as const, 12_345.678],
    [
      'recovery through its maximum clamp',
      { ...tuning, initial: 99 },
      'operational' as const,
      9_876.543,
    ],
    [
      'configured preservation',
      { ...tuning, initial: 73, operationalRecoveryPerSecond: 0 },
      'operational' as const,
      9_876.543,
    ],
  ])(
    'keeps %s projection identical across fractional wake-ups',
    (_name, scenarioTuning, classification, endTimeMs) => {
      const oneWake = run(
        [classifier(0, 1, classification), time(endTimeMs, 100)],
        scenarioTuning,
      )
      const fractionalWakes = run(
        [
          classifier(0, 1, classification),
          time(0.8, 2),
          time(13.37, 3),
          time(2_048.125, 4),
          time(endTimeMs, 100),
        ],
        scenarioTuning,
      )
      expect(fractionalWakes).toEqual(oneWake)
    },
  )

  it('finalizes exactly at zero when the boundary equals the fact time', () => {
    const boundaryTuning = { ...tuning, initial: 10 }
    const state = run(
      [classifier(0, 1, 'below'), time(5_000, 2)],
      boundaryTuning,
    )
    expect(state).toMatchObject({
      stability: 0,
      activeElapsedTimeMs: 5_000,
      status: {
        phase: 'finalized',
        outcome: 'failure',
        finalizedAtTimeMs: 5_000,
      },
    })
  })
})

describe('eligible active-play time', () => {
  it('freezes while suspended and resumes without retroactive drain', () => {
    const state = run([
      classifier(0, 1, 'below'),
      play(1_000, 2, 'suspended'),
      time(5_000, 3),
      play(5_000, 4, 'active'),
      time(6_000, 5),
    ])
    expect(state).toMatchObject({ activeElapsedTimeMs: 2_000, stability: 96 })
  })

  it.each([
    ['insufficient', 'insufficient'],
    ['stale', 'stale'],
    ['invalid', 'invalid'],
  ] as const)('freezes on %s signal', (_name, signalQuality) => {
    const state = run([
      classifier(0, 1, 'below'),
      classifier(1_000, 2, null, signalQuality),
      time(10_000, 3),
    ])
    expect(state).toMatchObject({ activeElapsedTimeMs: 1_000, stability: 98 })
  })

  it('freezes usable but not-yet-classified signal', () => {
    const state = run([
      classifier(0, 1, 'below'),
      classifier(1_000, 2, null),
      time(10_000, 3),
    ])
    expect(state).toMatchObject({ activeElapsedTimeMs: 1_000, stability: 98 })
  })

  it('uses the previous classification until a precise change timestamp', () => {
    const state = run([
      classifier(0, 1, 'below'),
      classifier(2_500, 2, 'operational'),
      time(3_500, 3),
    ])
    expect(state).toMatchObject({ activeElapsedTimeMs: 3_500, stability: 96 })
  })

  it('reanchors only at eligibility and rate changes, not intervening wakes', () => {
    const facts = [
      classifier(0, 1, 'below'),
      time(0.8, 2),
      play(1_000.25, 10, 'suspended'),
      time(2_222.222, 11),
      time(4_999.9, 12),
      play(5_000.5, 20, 'active'),
      classifier(7_500.75, 30, 'operational'),
      time(8_000.125, 40),
    ] as const
    const withoutSchedulerPartitions = run([
      classifier(0, 1, 'below'),
      play(1_000.25, 10, 'suspended'),
      play(5_000.5, 20, 'active'),
      classifier(7_500.75, 30, 'operational'),
      time(8_000.125, 40),
    ])

    expect(run(facts)).toEqual(withoutSchedulerPartitions)
  })

  it('does not let a scheduler wakeup invent classification or active time', () => {
    const state = run([time(50_000, 1)])
    expect(state).toMatchObject({ activeElapsedTimeMs: 0, stability: 100 })
  })
})

describe('ordered outcome precedence', () => {
  it('succeeds when puzzle completion is clearly before failure', () => {
    const state = run([classifier(0, 1, 'below'), puzzle(40_000, 2)])
    expect(state).toMatchObject({
      stability: 20,
      status: { phase: 'finalized', outcome: 'success' },
    })
  })

  it('fails at the stability boundary clearly before puzzle completion', () => {
    const state = run([classifier(0, 1, 'below'), puzzle(60_000, 2)])
    expect(state).toMatchObject({
      lastProcessedTimeMs: 50_000,
      stability: 0,
      status: { phase: 'finalized', outcome: 'failure' },
    })
  })

  it('keeps a near-boundary puzzle completion ahead of failure', () => {
    const state = run([classifier(0, 1, 'below'), puzzle(49_999.999, 2)])
    expect(state.status).toMatchObject({
      phase: 'finalized',
      outcome: 'success',
      finalizedAtTimeMs: 49_999.999,
    })
    expect(state.stability).toBeGreaterThan(0)
  })

  it('lets puzzle completion win an exact boundary when it is first in sequence', () => {
    const state = run([
      classifier(0, 1, 'below'),
      puzzle(50_000, 2),
      time(50_000, 3),
    ])
    expect(state.status).toEqual({
      phase: 'finalized',
      outcome: 'success',
      finalizedAtTimeMs: 50_000,
      finalizedBySequence: 2,
    })
  })

  it('lets a scheduler fact finalize exact-boundary failure when it is first', () => {
    const state = run([
      classifier(0, 1, 'below'),
      time(50_000, 2),
      puzzle(50_000, 3),
    ])
    expect(state.status).toEqual({
      phase: 'finalized',
      outcome: 'failure',
      finalizedAtTimeMs: 50_000,
      finalizedBySequence: 2,
    })
  })

  it('applies multiple facts at one timestamp strictly by sequence', () => {
    const state = run([
      classifier(0, 1, 'below'),
      classifier(10_000, 2, 'above'),
      play(10_000, 3, 'suspended'),
      puzzle(10_000, 4),
    ])
    expect(state).toMatchObject({
      activeElapsedTimeMs: 10_000,
      stability: 80,
      playState: 'suspended',
      stableClassification: 'above',
      status: {
        phase: 'finalized',
        outcome: 'success',
        finalizedBySequence: 4,
      },
    })
  })

  it('ignores duplicate puzzle completion and every fact after success', () => {
    const success = run([puzzle(1_000, 1)])
    const duplicate = advanceMission(success, puzzle(1_000, 2), tuning)
    expect(duplicate).toBe(success)
    expect(advanceMission(success, time(100_000, 3), tuning)).toBe(success)
  })

  it('cannot turn finalized failure into puzzle success or recovery', () => {
    const failure = run([classifier(0, 1, 'above'), time(40_000, 2)])
    expect(advanceMission(failure, puzzle(40_000, 3), tuning)).toBe(failure)
    expect(
      advanceMission(failure, classifier(40_000, 4, 'operational'), tuning),
    ).toBe(failure)
  })

  it('ignores all later fact categories consistently after finalization', () => {
    const finalized = run([puzzle(1_000, 1)])
    const laterFacts: readonly MissionFact[] = [
      time(2_000, 2),
      classifier(2_000, 3, 'below'),
      play(2_000, 4, 'suspended'),
      puzzle(2_000, 5),
      time(-1, 0),
    ]
    for (const fact of laterFacts) {
      expect(advanceMission(finalized, fact, tuning)).toBe(finalized)
    }
  })
})

describe('ordered input validation and determinism', () => {
  it('rejects stale time, duplicate sequence, and decreasing equal-time sequence', () => {
    const state = run([time(1_000, 10)])
    expect(() => advanceMission(state, time(999, 11), tuning)).toThrow(
      RangeError,
    )
    expect(() => advanceMission(state, time(2_000, 10), tuning)).toThrow(
      RangeError,
    )
    expect(() => advanceMission(state, time(1_000, 9), tuning)).toThrow(
      RangeError,
    )
  })

  it.each([
    time(Number.NaN, 1),
    time(Number.POSITIVE_INFINITY, 1),
    time(0, 0),
    time(0, 1.5),
  ])('rejects an invalid ongoing fact %#', (fact) => {
    const state = createActiveMissionState(0, tuning)
    expect(() => advanceMission(state, fact, tuning)).toThrow(RangeError)
  })

  it('replays the same fact script to exactly the same state', () => {
    const script = [
      classifier(0, 1, 'below'),
      time(1_250.5, 2),
      play(1_250.5, 3, 'suspended'),
      classifier(3_000, 4, null, 'stale'),
      play(5_000, 5, 'active'),
      classifier(5_000, 6, 'operational'),
      time(6_000, 7),
      puzzle(6_000, 8),
    ] as const
    expect(run(script)).toEqual(run(script))
  })

  it('has no dependency on browser clocks or real timer scheduling', () => {
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now must not be called')
    })
    const performanceNow = vi
      .spyOn(performance, 'now')
      .mockImplementation(() => {
        throw new Error('performance.now must not be called')
      })
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    const state = run([
      classifier(0, 1, 'operational'),
      time(1_000, 2),
      puzzle(1_000, 3),
    ])

    expect(state.status).toMatchObject({ outcome: 'success' })
    expect(setTimeoutSpy).not.toHaveBeenCalled()
    dateNow.mockRestore()
    performanceNow.mockRestore()
    setTimeoutSpy.mockRestore()
  })
})
