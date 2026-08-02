import { describe, expect, it } from 'vitest'

import {
  deserializeMissionResult,
  MISSION_RESULT_SCHEMA_VERSION,
  serializeMissionResult,
  validateMissionResult,
  type MissionResult,
} from './MissionResult'
import { buildMissionResult } from '../../test/missionResultBuilder'

function validResult(): MissionResult {
  return {
    schemaVersion: MISSION_RESULT_SCHEMA_VERSION,
    outcome: 'success',
    startedAtTimeMs: 100,
    finalizedAtTimeMs: 10_100,
    missionDurationMs: 10_000,
    activeDurationMs: 6_000,
    suspendedDurationMs: 2_000,
    targetRange: { lowerBpm: 100, upperBpm: 140 },
    validSampleCount: 3,
    minimumBpm: 100,
    averageBpm: 120.25,
    peakBpm: 140,
    belowRangeDurationMs: 1_000,
    operationalDurationMs: 3_000,
    aboveRangeDurationMs: 2_000,
    unclassifiedDurationMs: 1_000,
    unusableSignalDurationMs: 1_000,
    belowRangePercentage: (1_000 / 6_000) * 100,
    operationalPercentage: 50,
    aboveRangePercentage: (2_000 / 6_000) * 100,
    lowOutputEpisodeCount: 2,
    overloadEpisodeCount: 1,
    endingStability: 42.5,
    pauseCount: 2,
    disconnectCount: 1,
    disconnectedDurationMs: 1_000,
    puzzleMoveCount: 7,
    hintUsed: true,
    puzzleCompleted: true,
  }
}

describe('MissionResult serialization and runtime validation', () => {
  it('round trips one deeply frozen canonical result', () => {
    const serialized = serializeMissionResult(validResult())
    const result = deserializeMissionResult(serialized)
    expect(result).toEqual(validResult())
    expect(result.schemaVersion).toBe(1)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.targetRange)).toBe(true)
  })

  it('serializes deterministically regardless of runtime property order', () => {
    const source = validResult()
    const reversed = Object.fromEntries(Object.entries(source).reverse())
    expect(serializeMissionResult(reversed as unknown as MissionResult)).toBe(
      serializeMissionResult(source),
    )
  })

  it.each(Object.keys(validResult()))(
    'rejects missing required field %s',
    (field) => {
      const runtime = { ...validResult() } as Record<string, unknown>
      delete runtime[field]
      expect(() => validateMissionResult(runtime)).toThrow(RangeError)
    },
  )

  it.each(['lowerBpm', 'upperBpm'])(
    'rejects missing target-range field %s',
    (field) => {
      const targetRange = { ...validResult().targetRange } as Record<
        string,
        unknown
      >
      delete targetRange[field]
      expect(() =>
        validateMissionResult({ ...validResult(), targetRange }),
      ).toThrow(RangeError)
    },
  )

  it.each([undefined, null, [], 'result', 1])(
    'rejects non-object runtime input %#',
    (runtime) => {
      expect(() => validateMissionResult(runtime)).toThrow(RangeError)
    },
  )

  it.each([
    ['outcome', 'abandoned'],
    ['hintUsed', 'yes'],
    ['validSampleCount', 1.5],
    ['targetRange', '100-140'],
    ['minimumBpm', 100.5],
  ])('rejects invalid runtime field %s', (field, value) => {
    expect(() =>
      validateMissionResult({ ...validResult(), [field]: value }),
    ).toThrow(RangeError)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid finite numeric value %s',
    (value) => {
      expect(() =>
        validateMissionResult({ ...validResult(), endingStability: value }),
      ).toThrow(RangeError)
    },
  )

  it.each([
    ['negative duration', { suspendedDurationMs: -1 }],
    ['negative count', { puzzleMoveCount: -1 }],
    ['unsafe count', { pauseCount: Number.MAX_SAFE_INTEGER + 1 }],
    ['unordered target', { targetRange: { lowerBpm: 140, upperBpm: 100 } }],
    ['inconsistent final time', { finalizedAtTimeMs: 10_099 }],
    ['inconsistent active total', { activeDurationMs: 5_999 }],
    ['inconsistent mission total', { unusableSignalDurationMs: 999 }],
    ['disconnect beyond suspension', { disconnectedDurationMs: 2_001 }],
    ['average below minimum', { averageBpm: 99 }],
    ['partial percentages', { operationalPercentage: null }],
    ['wrong percentage', { operationalPercentage: 49 }],
    [
      'one sample with different extrema',
      {
        validSampleCount: 1,
        minimumBpm: 100,
        averageBpm: null,
        peakBpm: 140,
      },
    ],
    [
      'zero samples with classified percentages',
      {
        validSampleCount: 0,
        minimumBpm: null,
        averageBpm: null,
        peakBpm: null,
      },
    ],
    ['positive suspension without a pause', { pauseCount: 0 }],
    [
      'positive disconnect duration without a disconnect',
      { disconnectCount: 0 },
    ],
    [
      'disconnect episode without a pause episode',
      {
        suspendedDurationMs: 0,
        disconnectedDurationMs: 0,
        unusableSignalDurationMs: 3_000,
        pauseCount: 0,
      },
    ],
    ['success without completion', { puzzleCompleted: false }],
    ['failure with completion', { outcome: 'failure' }],
  ])('rejects %s', (_name, change) => {
    expect(() =>
      validateMissionResult({ ...validResult(), ...change }),
    ).toThrow(RangeError)
  })

  it('requires null BPM fields when no samples qualify', () => {
    expect(() =>
      validateMissionResult({
        ...validResult(),
        validSampleCount: 0,
        minimumBpm: null,
        averageBpm: null,
        peakBpm: 120,
      }),
    ).toThrow(RangeError)
  })

  it.each([
    [
      'one sample with matching extrema',
      {
        validSampleCount: 1,
        minimumBpm: 120,
        averageBpm: 120,
        peakBpm: 120,
      },
    ],
    [
      'zero samples and null percentages',
      {
        validSampleCount: 0,
        minimumBpm: null,
        averageBpm: null,
        peakBpm: null,
        belowRangePercentage: null,
        operationalPercentage: null,
        aboveRangePercentage: null,
      },
    ],
    [
      'equal-time pause and disconnect episodes',
      {
        suspendedDurationMs: 0,
        disconnectedDurationMs: 0,
        unusableSignalDurationMs: 3_000,
      },
    ],
    [
      'zero-duration low-output episode',
      {
        belowRangeDurationMs: 0,
        operationalDurationMs: 4_000,
        belowRangePercentage: 0,
        operationalPercentage: (4_000 / 6_000) * 100,
        lowOutputEpisodeCount: 1,
      },
    ],
  ])('accepts nearby valid case: %s', (_name, change) => {
    expect(
      validateMissionResult({ ...validResult(), ...change }),
    ).toMatchObject(change)
  })

  it.each([0, 2, 999])(
    'rejects unsupported schema version %s',
    (schemaVersion) => {
      expect(() =>
        validateMissionResult({ ...validResult(), schemaVersion }),
      ).toThrow(/Unsupported mission result schema version/)
    },
  )

  it('rejects invalid JSON', () => {
    expect(() => deserializeMissionResult('{not-json')).toThrow(RangeError)
  })

  it('contains only finite plain serializable data and round trips supported boundary values', () => {
    const result = buildMissionResult({
      startedAtTimeMs: 0,
      finalizedAtTimeMs: 60_000,
      missionDurationMs: 60_000,
      suspendedDurationMs: 0,
      unclassifiedDurationMs: 0,
      unusableSignalDurationMs: 0,
      pauseCount: 0,
      disconnectCount: 0,
      disconnectedDurationMs: 0,
      lowOutputEpisodeCount: 0,
      overloadEpisodeCount: 0,
      endingStability: 100,
      puzzleMoveCount: 0,
      hintUsed: false,
    })
    const seen = new Set<unknown>()
    const inspect = (value: unknown): void => {
      expect(typeof value).not.toBe('function')
      expect(typeof value).not.toBe('symbol')
      if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true)
      if (typeof value !== 'object' || value === null) return
      expect(value).not.toBeInstanceOf(Map)
      expect(value).not.toBeInstanceOf(Set)
      expect(
        Array.isArray(value) ||
          Object.getPrototypeOf(value) === Object.prototype,
      ).toBe(true)
      if (seen.has(value)) throw new Error('Mission result must not be cyclic')
      seen.add(value)
      for (const child of Object.values(value)) inspect(child)
    }

    inspect(result)
    expect(deserializeMissionResult(JSON.stringify(result))).toEqual(result)
  })
})
