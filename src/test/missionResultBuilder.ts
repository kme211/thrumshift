import {
  MISSION_RESULT_SCHEMA_VERSION,
  validateMissionResult,
  type MissionResult,
} from '../domain/mission/MissionResult'

export function buildMissionResult(
  overrides: Partial<MissionResult> = {},
): MissionResult {
  return validateMissionResult({
    schemaVersion: MISSION_RESULT_SCHEMA_VERSION,
    outcome: 'success',
    startedAtTimeMs: 1_000,
    finalizedAtTimeMs: 71_000,
    missionDurationMs: 70_000,
    activeDurationMs: 60_000,
    suspendedDurationMs: 4_000,
    targetRange: { lowerBpm: 100, upperBpm: 140 },
    validSampleCount: 60,
    minimumBpm: 92,
    averageBpm: 118.4,
    peakBpm: 151,
    belowRangeDurationMs: 9_000,
    operationalDurationMs: 45_000,
    aboveRangeDurationMs: 6_000,
    unclassifiedDurationMs: 4_000,
    unusableSignalDurationMs: 2_000,
    belowRangePercentage: 15,
    operationalPercentage: 75,
    aboveRangePercentage: 10,
    lowOutputEpisodeCount: 2,
    overloadEpisodeCount: 1,
    endingStability: 84.6,
    pauseCount: 2,
    disconnectCount: 1,
    disconnectedDurationMs: 2_000,
    puzzleMoveCount: 8,
    hintUsed: true,
    puzzleCompleted: true,
    ...overrides,
  })
}

export function buildFailedMissionResult(
  overrides: Partial<MissionResult> = {},
): MissionResult {
  return buildMissionResult({
    outcome: 'failure',
    endingStability: 0,
    puzzleCompleted: false,
    ...overrides,
  })
}

export function buildSparseMissionResult(
  overrides: Partial<MissionResult> = {},
): MissionResult {
  return buildMissionResult({
    validSampleCount: 2,
    minimumBpm: 110,
    averageBpm: null,
    peakBpm: 124,
    belowRangePercentage: null,
    operationalPercentage: null,
    aboveRangePercentage: null,
    ...overrides,
  })
}
