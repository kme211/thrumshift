import type { TargetRange } from '../heart-rate/classifier'
import type { MissionOutcome } from './activeMission'

export const MISSION_RESULT_SCHEMA_VERSION = 1 as const

export interface MissionResult {
  readonly schemaVersion: typeof MISSION_RESULT_SCHEMA_VERSION
  readonly outcome: MissionOutcome
  readonly startedAtTimeMs: number
  readonly finalizedAtTimeMs: number
  readonly missionDurationMs: number
  readonly activeDurationMs: number
  readonly suspendedDurationMs: number
  readonly targetRange: TargetRange
  readonly validSampleCount: number
  readonly minimumBpm: number | null
  readonly averageBpm: number | null
  readonly peakBpm: number | null
  readonly belowRangeDurationMs: number
  readonly operationalDurationMs: number
  readonly aboveRangeDurationMs: number
  readonly unclassifiedDurationMs: number
  readonly unusableSignalDurationMs: number
  readonly belowRangePercentage: number | null
  readonly operationalPercentage: number | null
  readonly aboveRangePercentage: number | null
  readonly lowOutputEpisodeCount: number
  readonly overloadEpisodeCount: number
  readonly endingStability: number
  readonly pauseCount: number
  readonly disconnectCount: number
  readonly disconnectedDurationMs: number
  readonly puzzleMoveCount: number
  readonly hintUsed: boolean
  readonly puzzleCompleted: boolean
}

type RuntimeObject = Record<PropertyKey, unknown>

function runtimeObject(value: unknown, name: string): RuntimeObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RangeError(`${name} must be an object`)
  }
  return value as RuntimeObject
}

function required(value: RuntimeObject, name: string): unknown {
  if (!Object.hasOwn(value, name)) {
    throw new RangeError(`missionResult.${name} is required`)
  }
  return value[name]
}

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`)
  }
  return value
}

function nonnegativeNumber(value: unknown, name: string): number {
  const number = finiteNumber(value, name)
  if (number < 0) throw new RangeError(`${name} must be nonnegative`)
  return number
}

function nonnegativeCount(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer`)
  }
  return value as number
}

function nullableBpm(value: unknown, name: string): number | null {
  if (value === null) return null
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new RangeError(`${name} must be null or a positive safe integer`)
  }
  return value as number
}

function nullableFiniteNumber(value: unknown, name: string): number | null {
  return value === null ? null : finiteNumber(value, name)
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new RangeError(`${name} must be boolean`)
  }
  return value
}

function nearlyEqual(first: number, second: number): boolean {
  const scale = Math.max(1, Math.abs(first), Math.abs(second))
  return Math.abs(first - second) <= Number.EPSILON * scale * 32
}

function canonicalMissionResult(runtime: RuntimeObject): MissionResult {
  const schemaVersion = required(runtime, 'schemaVersion')
  if (schemaVersion !== MISSION_RESULT_SCHEMA_VERSION) {
    throw new RangeError(
      `Unsupported mission result schema version: ${String(schemaVersion)}`,
    )
  }
  const outcome = required(runtime, 'outcome')
  if (outcome !== 'success' && outcome !== 'failure') {
    throw new RangeError('missionResult.outcome must be success or failure')
  }
  const targetRangeRuntime = runtimeObject(
    required(runtime, 'targetRange'),
    'missionResult.targetRange',
  )
  const lowerBpm = nullableBpm(
    required(targetRangeRuntime, 'lowerBpm'),
    'missionResult.targetRange.lowerBpm',
  )
  const upperBpm = nullableBpm(
    required(targetRangeRuntime, 'upperBpm'),
    'missionResult.targetRange.upperBpm',
  )
  if (lowerBpm === null || upperBpm === null || lowerBpm >= upperBpm) {
    throw new RangeError('missionResult.targetRange must be ordered')
  }

  const result: MissionResult = {
    schemaVersion,
    outcome,
    startedAtTimeMs: nonnegativeNumber(
      required(runtime, 'startedAtTimeMs'),
      'missionResult.startedAtTimeMs',
    ),
    finalizedAtTimeMs: nonnegativeNumber(
      required(runtime, 'finalizedAtTimeMs'),
      'missionResult.finalizedAtTimeMs',
    ),
    missionDurationMs: nonnegativeNumber(
      required(runtime, 'missionDurationMs'),
      'missionResult.missionDurationMs',
    ),
    activeDurationMs: nonnegativeNumber(
      required(runtime, 'activeDurationMs'),
      'missionResult.activeDurationMs',
    ),
    suspendedDurationMs: nonnegativeNumber(
      required(runtime, 'suspendedDurationMs'),
      'missionResult.suspendedDurationMs',
    ),
    targetRange: Object.freeze({ lowerBpm, upperBpm }),
    validSampleCount: nonnegativeCount(
      required(runtime, 'validSampleCount'),
      'missionResult.validSampleCount',
    ),
    minimumBpm: nullableBpm(
      required(runtime, 'minimumBpm'),
      'missionResult.minimumBpm',
    ),
    averageBpm: nullableFiniteNumber(
      required(runtime, 'averageBpm'),
      'missionResult.averageBpm',
    ),
    peakBpm: nullableBpm(required(runtime, 'peakBpm'), 'missionResult.peakBpm'),
    belowRangeDurationMs: nonnegativeNumber(
      required(runtime, 'belowRangeDurationMs'),
      'missionResult.belowRangeDurationMs',
    ),
    operationalDurationMs: nonnegativeNumber(
      required(runtime, 'operationalDurationMs'),
      'missionResult.operationalDurationMs',
    ),
    aboveRangeDurationMs: nonnegativeNumber(
      required(runtime, 'aboveRangeDurationMs'),
      'missionResult.aboveRangeDurationMs',
    ),
    unclassifiedDurationMs: nonnegativeNumber(
      required(runtime, 'unclassifiedDurationMs'),
      'missionResult.unclassifiedDurationMs',
    ),
    unusableSignalDurationMs: nonnegativeNumber(
      required(runtime, 'unusableSignalDurationMs'),
      'missionResult.unusableSignalDurationMs',
    ),
    belowRangePercentage: nullableFiniteNumber(
      required(runtime, 'belowRangePercentage'),
      'missionResult.belowRangePercentage',
    ),
    operationalPercentage: nullableFiniteNumber(
      required(runtime, 'operationalPercentage'),
      'missionResult.operationalPercentage',
    ),
    aboveRangePercentage: nullableFiniteNumber(
      required(runtime, 'aboveRangePercentage'),
      'missionResult.aboveRangePercentage',
    ),
    lowOutputEpisodeCount: nonnegativeCount(
      required(runtime, 'lowOutputEpisodeCount'),
      'missionResult.lowOutputEpisodeCount',
    ),
    overloadEpisodeCount: nonnegativeCount(
      required(runtime, 'overloadEpisodeCount'),
      'missionResult.overloadEpisodeCount',
    ),
    endingStability: nonnegativeNumber(
      required(runtime, 'endingStability'),
      'missionResult.endingStability',
    ),
    pauseCount: nonnegativeCount(
      required(runtime, 'pauseCount'),
      'missionResult.pauseCount',
    ),
    disconnectCount: nonnegativeCount(
      required(runtime, 'disconnectCount'),
      'missionResult.disconnectCount',
    ),
    disconnectedDurationMs: nonnegativeNumber(
      required(runtime, 'disconnectedDurationMs'),
      'missionResult.disconnectedDurationMs',
    ),
    puzzleMoveCount: nonnegativeCount(
      required(runtime, 'puzzleMoveCount'),
      'missionResult.puzzleMoveCount',
    ),
    hintUsed: boolean(required(runtime, 'hintUsed'), 'missionResult.hintUsed'),
    puzzleCompleted: boolean(
      required(runtime, 'puzzleCompleted'),
      'missionResult.puzzleCompleted',
    ),
  }

  if (
    result.finalizedAtTimeMs < result.startedAtTimeMs ||
    !nearlyEqual(
      result.missionDurationMs,
      result.finalizedAtTimeMs - result.startedAtTimeMs,
    )
  ) {
    throw new RangeError('Mission result timing is inconsistent')
  }

  const classifiedDurationMs =
    result.belowRangeDurationMs +
    result.operationalDurationMs +
    result.aboveRangeDurationMs
  if (!nearlyEqual(result.activeDurationMs, classifiedDurationMs)) {
    throw new RangeError(
      'Mission active duration must equal classified durations',
    )
  }
  const categorizedDurationMs =
    classifiedDurationMs +
    result.unclassifiedDurationMs +
    result.unusableSignalDurationMs +
    result.suspendedDurationMs
  if (!nearlyEqual(result.missionDurationMs, categorizedDurationMs)) {
    throw new RangeError(
      'Mission duration must equal categorized and suspended durations',
    )
  }
  if (
    result.disconnectedDurationMs > result.suspendedDurationMs &&
    !nearlyEqual(result.disconnectedDurationMs, result.suspendedDurationMs)
  ) {
    throw new RangeError(
      'Disconnected duration cannot exceed suspended duration',
    )
  }
  if (result.suspendedDurationMs > 0 && result.pauseCount === 0) {
    throw new RangeError('Positive suspended duration requires a pause count')
  }
  if (result.disconnectedDurationMs > 0 && result.disconnectCount === 0) {
    throw new RangeError(
      'Positive disconnected duration requires a disconnect count',
    )
  }
  if (result.disconnectCount > 0 && result.pauseCount === 0) {
    throw new RangeError('A disconnect episode requires a pause episode')
  }

  if (result.validSampleCount === 0) {
    if (
      result.minimumBpm !== null ||
      result.averageBpm !== null ||
      result.peakBpm !== null
    ) {
      throw new RangeError('Empty sample metrics must use null BPM values')
    }
  } else {
    if (
      result.minimumBpm === null ||
      result.peakBpm === null ||
      result.minimumBpm > result.peakBpm
    ) {
      throw new RangeError('Sample minimum and peak BPM are inconsistent')
    }
    if (result.validSampleCount === 1 && result.minimumBpm !== result.peakBpm) {
      throw new RangeError(
        'One sample must have identical minimum and peak BPM',
      )
    }
    if (
      result.averageBpm !== null &&
      (result.averageBpm < result.minimumBpm ||
        result.averageBpm > result.peakBpm)
    ) {
      throw new RangeError('Average BPM must fall between minimum and peak')
    }
  }

  const percentages = [
    result.belowRangePercentage,
    result.operationalPercentage,
    result.aboveRangePercentage,
  ] as const
  const presentPercentageCount = percentages.filter(
    (percentage) => percentage !== null,
  ).length
  if (result.validSampleCount === 0 && presentPercentageCount > 0) {
    throw new RangeError('Classified percentages require qualifying samples')
  }
  if (presentPercentageCount !== 0 && presentPercentageCount !== 3) {
    throw new RangeError('Classified percentages must be all present or null')
  }
  if (presentPercentageCount === 3) {
    if (classifiedDurationMs <= 0) {
      throw new RangeError('Classified percentages require classified time')
    }
    const concretePercentages = percentages as readonly [number, number, number]
    if (
      concretePercentages.some(
        (percentage) => percentage < 0 || percentage > 100,
      ) ||
      !nearlyEqual(
        concretePercentages.reduce((sum, value) => sum + value, 0),
        100,
      ) ||
      !nearlyEqual(
        concretePercentages[0],
        (result.belowRangeDurationMs / classifiedDurationMs) * 100,
      ) ||
      !nearlyEqual(
        concretePercentages[1],
        (result.operationalDurationMs / classifiedDurationMs) * 100,
      ) ||
      !nearlyEqual(
        concretePercentages[2],
        (result.aboveRangeDurationMs / classifiedDurationMs) * 100,
      )
    ) {
      throw new RangeError('Classified percentages are inconsistent')
    }
  }

  if (result.puzzleCompleted !== (result.outcome === 'success')) {
    throw new RangeError(
      'Puzzle completion must match the authoritative mission outcome',
    )
  }
  return Object.freeze(result)
}

export function validateMissionResult(value: unknown): MissionResult {
  return canonicalMissionResult(runtimeObject(value, 'missionResult'))
}

export function serializeMissionResult(result: MissionResult): string {
  return JSON.stringify(validateMissionResult(result))
}

export function deserializeMissionResult(serialized: string): MissionResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized) as unknown
  } catch {
    throw new RangeError('Mission result JSON must be valid')
  }
  return validateMissionResult(parsed)
}
