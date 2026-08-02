import { describe, expect, it } from 'vitest'

import {
  buildFailedMissionResult,
  buildMissionResult,
  buildSparseMissionResult,
} from '../../test/missionResultBuilder'
import {
  apportionPercentages,
  createMissionResultViewModel,
  formatDuration,
} from './missionResultViewModel'

describe('percentage apportionment', () => {
  it.each([
    {
      name: 'exact thirds',
      input: [100 / 3, 100 / 3, 100 / 3] as const,
      output: { below: 34, operational: 33, above: 33 },
    },
    {
      name: 'values near half-percent boundaries',
      input: [10.49, 75.5, 14.01] as const,
      output: { below: 10, operational: 76, above: 14 },
    },
    {
      name: 'one category at 100 percent',
      input: [0, 100, 0] as const,
      output: { below: 0, operational: 100, above: 0 },
    },
    {
      name: 'two zero categories',
      input: [100, 0, 0] as const,
      output: { below: 100, operational: 0, above: 0 },
    },
    {
      name: 'very small nonzero category',
      input: [0.01, 99.98, 0.01] as const,
      output: { below: 0, operational: 100, above: 0 },
    },
    {
      name: 'independent rounding would total 99',
      input: [33.2, 33.2, 33.6] as const,
      output: { below: 33, operational: 33, above: 34 },
    },
    {
      name: 'independent rounding would total 101',
      input: [33.5, 33.5, 33] as const,
      output: { below: 34, operational: 33, above: 33 },
    },
  ])('$name', ({ input, output }) => {
    const apportioned = apportionPercentages(input)
    expect(apportioned).toEqual(output)
    expect(
      Object.values(apportioned).reduce((sum, value) => sum + value, 0),
    ).toBe(100)
  })

  it('uses stable below, operational, above ordering to resolve ties', () => {
    const input = [33.5, 33.5, 33] as const
    expect(apportionPercentages(input)).toEqual(apportionPercentages(input))
    expect(apportionPercentages(input)).toEqual({
      below: 34,
      operational: 33,
      above: 33,
    })
  })

  it('rejects invalid percentage groups instead of exposing invalid values', () => {
    expect(() => apportionPercentages([Number.NaN, 50, 50])).toThrow(RangeError)
    expect(() => apportionPercentages([10, 20, 30])).toThrow(RangeError)
  })
})

describe('mission result view model', () => {
  it.each([
    [0, { visual: '0:00', accessible: '0 seconds' }],
    [1_000, { visual: '0:01', accessible: '1 second' }],
    [61_000, { visual: '1:01', accessible: '1 minute 1 second' }],
    [3_600_000, { visual: '1:00:00', accessible: '1 hour' }],
    [3_661_000, { visual: '1:01:01', accessible: '1 hour 1 minute 1 second' }],
  ])('formats %i milliseconds visually and accessibly', (input, expected) => {
    expect(formatDuration(input)).toEqual(expected)
  })

  it('rejects invalid durations', () => {
    expect(() => formatDuration(-1)).toThrow(RangeError)
    expect(() => formatDuration(Number.NaN)).toThrow(RangeError)
  })

  it('formats a representative successful result', () => {
    const view = createMissionResultViewModel(buildMissionResult())
    expect(view.heading).toBe('Mission successful')
    expect(view.summary).toContain('coolant route was restored')
    expect(view.duration).toEqual({
      label: 'Completion time',
      value: '1:10',
      accessibleValue: '1 minute 10 seconds',
    })
    expect(view.coreMetrics).toEqual([
      {
        label: 'Active classified time',
        value: '1:00',
        accessibleValue: '1 minute',
      },
      { label: 'Average heart rate', value: '118 BPM' },
      { label: 'Peak heart rate', value: '151 BPM' },
      { label: 'Station stability remaining', value: '85 of 100' },
    ])
    expect(view.rangeMetrics?.map(({ value }) => value)).toEqual([
      '15%',
      '75%',
      '10%',
    ])
    expect(view.eventMetrics).toEqual([
      { label: 'Low-output events', value: '2 events' },
      { label: 'Overload events', value: '1 event' },
    ])
    expect(view.puzzleMetrics).toEqual([
      { label: 'Coolant route', value: 'Completed' },
      { label: 'Puzzle moves', value: '8 moves' },
      { label: 'Hint use', value: 'Hint used' },
    ])
  })

  it('uses mission-duration language for failure', () => {
    const view = createMissionResultViewModel(buildFailedMissionResult())
    expect(view.heading).toBe('Mission failed')
    expect(view.duration.label).toBe('Mission duration')
    expect(view.duration.label).not.toContain('Completion')
    expect(view.puzzleMetrics[0]).toEqual({
      label: 'Coolant route',
      value: 'Incomplete',
    })
  })

  it('formats exact duration, singular counts, zero events, and unused hints', () => {
    const view = createMissionResultViewModel(
      buildMissionResult({
        finalizedAtTimeMs: 62_500,
        missionDurationMs: 61_500,
        activeDurationMs: 55_500,
        belowRangeDurationMs: 5_500,
        operationalDurationMs: 44_000,
        aboveRangeDurationMs: 6_000,
        belowRangePercentage: (5_500 / 55_500) * 100,
        operationalPercentage: (44_000 / 55_500) * 100,
        aboveRangePercentage: (6_000 / 55_500) * 100,
        unclassifiedDurationMs: 0,
        unusableSignalDurationMs: 2_000,
        suspendedDurationMs: 4_000,
        lowOutputEpisodeCount: 1,
        overloadEpisodeCount: 0,
        puzzleMoveCount: 1,
        hintUsed: false,
      }),
    )
    expect(view.duration.value).toBe('1:02')
    expect(view.eventMetrics).toEqual([
      { label: 'Low-output events', value: '1 event' },
      { label: 'Overload events', value: '0 events' },
    ])
    expect(view.puzzleMetrics).toContainEqual({
      label: 'Puzzle moves',
      value: '1 move',
    })
    expect(view.puzzleMetrics).toContainEqual({
      label: 'Hint use',
      value: 'No hint used',
    })
  })

  it('discloses signal gaps and understandable interruption information', () => {
    const view = createMissionResultViewModel(buildMissionResult())
    expect(view.signalMetrics).toEqual([
      {
        label: 'Unclassified signal time',
        value: '0:04',
        accessibleValue: '4 seconds',
      },
      {
        label: 'Unusable signal time',
        value: '0:02',
        accessibleValue: '2 seconds',
      },
    ])
    expect(view.interruptionMetrics).toEqual([
      {
        label: 'Paused time',
        value: '0:04 across 2 pauses',
        accessibleValue: '4 seconds across 2 pauses',
      },
      {
        label: 'Disconnects',
        value: '1 disconnect; 0:02 included in paused time',
        accessibleValue: '1 disconnect; 2 seconds included in paused time',
      },
    ])
  })

  it('suppresses unsupported average and percentage claims for sparse signal', () => {
    const view = createMissionResultViewModel(buildSparseMissionResult())
    expect(view.coreMetrics).not.toContainEqual(
      expect.objectContaining({ label: 'Average heart rate' }),
    )
    expect(view.coreMetrics).toContainEqual({
      label: 'Peak heart rate',
      value: '124 BPM',
    })
    expect(view.rangeMetrics).toBeNull()
    expect(view.signalExplanation).toBe(
      'Usable signal data was insufficient for both an average BPM and a range breakdown.',
    )
    expect(JSON.stringify(view)).not.toMatch(/NaN|Infinity/)
  })

  it.each([
    {
      name: 'both average and range available',
      override: {},
      averageVisible: true,
      rangeVisible: true,
      explanation: null,
      rating: 'Controlled Finish',
    },
    {
      name: 'average unavailable and range available',
      override: { averageBpm: null },
      averageVisible: false,
      rangeVisible: true,
      explanation: 'Usable signal data was insufficient for an average BPM.',
      rating: 'Controlled Finish',
    },
    {
      name: 'average available and range unavailable',
      override: {
        belowRangePercentage: null,
        operationalPercentage: null,
        aboveRangePercentage: null,
      },
      averageVisible: true,
      rangeVisible: false,
      explanation: 'Usable signal data was insufficient for a range breakdown.',
      rating: 'Completed',
    },
    {
      name: 'both average and range unavailable',
      override: {
        averageBpm: null,
        belowRangePercentage: null,
        operationalPercentage: null,
        aboveRangePercentage: null,
      },
      averageVisible: false,
      rangeVisible: false,
      explanation:
        'Usable signal data was insufficient for both an average BPM and a range breakdown.',
      rating: 'Completed',
    },
  ])(
    'handles $name independently',
    ({ override, averageVisible, rangeVisible, explanation, rating }) => {
      const view = createMissionResultViewModel(buildMissionResult(override))
      expect(
        view.coreMetrics.some(({ label }) => label === 'Average heart rate'),
      ).toBe(averageVisible)
      expect(view.rangeMetrics !== null).toBe(rangeVisible)
      expect(view.signalExplanation).toBe(explanation)
      expect(view.rating.label).toBe(rating)
      expect(JSON.stringify(view)).not.toMatch(/NaN|Infinity/)
    },
  )

  it('suppresses zero-duration optional signal and interruption rows', () => {
    const view = createMissionResultViewModel(
      buildMissionResult({
        finalizedAtTimeMs: 61_000,
        missionDurationMs: 60_000,
        suspendedDurationMs: 0,
        unclassifiedDurationMs: 0,
        unusableSignalDurationMs: 0,
        pauseCount: 0,
        disconnectCount: 0,
        disconnectedDurationMs: 0,
      }),
    )
    expect(view.signalMetrics).toEqual([])
    expect(view.interruptionMetrics).toEqual([])
  })

  it.each([
    {
      name: 'Controlled Finish at the inclusive displayed boundary',
      operationalDurationMs: 44_700,
      expectedPercentage: 75,
      expectedRating: 'Controlled Finish',
    },
    {
      name: 'Completed below the displayed boundary',
      operationalDurationMs: 43_000,
      expectedPercentage: 74,
      expectedRating: 'Completed',
    },
  ])(
    '$name',
    ({ operationalDurationMs, expectedPercentage, expectedRating }) => {
      const belowRangeDurationMs = 9_000
      const aboveRangeDurationMs = 6_000
      const activeDurationMs =
        belowRangeDurationMs + operationalDurationMs + aboveRangeDurationMs
      const result = buildMissionResult({
        finalizedAtTimeMs: 1_000 + activeDurationMs + 10_000,
        missionDurationMs: activeDurationMs + 10_000,
        activeDurationMs,
        operationalDurationMs,
        belowRangePercentage: (belowRangeDurationMs / activeDurationMs) * 100,
        operationalPercentage: (operationalDurationMs / activeDurationMs) * 100,
        aboveRangePercentage: (aboveRangeDurationMs / activeDurationMs) * 100,
      })
      const view = createMissionResultViewModel(result)
      expect(
        view.rangeMetrics?.find(({ label }) => label === 'Operational')
          ?.percentage,
      ).toBe(expectedPercentage)
      expect(view.rating.label).toBe(expectedRating)
      expect(view.rating.criteria).toContain('at least 75%')
    },
  )

  it('rates insufficient-signal success Completed and every failure Incomplete', () => {
    expect(
      createMissionResultViewModel(buildSparseMissionResult()).rating.label,
    ).toBe('Completed')
    expect(
      createMissionResultViewModel(buildFailedMissionResult()).rating.label,
    ).toBe('Incomplete')
  })

  it('is deterministic and does not mutate its deeply frozen input', () => {
    const result = buildMissionResult()
    const serialized = JSON.stringify(result)
    const first = createMissionResultViewModel(result)
    const second = createMissionResultViewModel(result)
    expect(first).toEqual(second)
    expect(JSON.stringify(result)).toBe(serialized)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.targetRange)).toBe(true)
  })
})
