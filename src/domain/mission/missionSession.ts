import {
  validateGameplayTuning,
  type GameplayTuning,
} from '../../config/gameplayTuning'
import { validateTargetRange, type TargetRange } from '../heart-rate/classifier'
import {
  createActiveMissionState,
  getMissionIntervalBehavior,
  transitionMission,
  type ActiveMissionState,
  type MissionFact,
} from './activeMission'
import {
  MISSION_RESULT_SCHEMA_VERSION,
  validateMissionResult,
  type MissionResult,
} from './MissionResult'
import {
  assertLifecycleProjection,
  createMissionStatisticsState,
  transitionMissionStatistics,
  type MissionSessionFact,
  type MissionStatisticsState,
} from './missionStatistics'

export interface MissionSessionState {
  readonly mission: ActiveMissionState
  readonly statistics: MissionStatisticsState
  readonly targetRange: TargetRange
  readonly result: MissionResult | null
}

export function createMissionSessionState(
  initialTimeMs: number,
  targetRange: TargetRange,
  tuning: GameplayTuning,
): MissionSessionState {
  validateGameplayTuning(tuning)
  validateTargetRange(targetRange, tuning.heartRateClassifier)
  const mission = createActiveMissionState(initialTimeMs, tuning.stability)
  return {
    mission,
    statistics: createMissionStatisticsState(
      initialTimeMs,
      getMissionIntervalBehavior(mission),
    ),
    targetRange: Object.freeze({ ...targetRange }),
    result: null,
  }
}

function gateFact(fact: MissionSessionFact): MissionFact {
  switch (fact.type) {
    case 'classifierUpdated':
      return fact
    case 'lifecycleProjectionChanged':
      assertLifecycleProjection(fact)
      return {
        type: 'playStateChanged',
        occurrenceTimeMs: fact.occurrenceTimeMs,
        sequence: fact.sequence,
        playState: fact.suspended ? 'suspended' : 'active',
      }
    case 'puzzleCompleted':
      return fact
    case 'timeAdvanced':
    case 'heartRateSample':
    case 'puzzleTileRotated':
    case 'puzzleHintRequested':
    case 'puzzleReset':
      return {
        type: 'timeAdvanced',
        occurrenceTimeMs: fact.occurrenceTimeMs,
        sequence: fact.sequence,
      }
  }
}

function percentage(durationMs: number, totalMs: number): number {
  return (durationMs / totalMs) * 100
}

function createResult(
  mission: ActiveMissionState,
  statistics: MissionStatisticsState,
  targetRange: TargetRange,
  tuning: GameplayTuning,
): MissionResult {
  if (mission.status.phase !== 'finalized') {
    throw new Error('A mission result requires a finalized mission')
  }
  const durations = statistics.completedDurationsMs
  const classifiedDurationMs =
    durations.belowRange + durations.operational + durations.aboveRange
  const sampleCountIsSufficient =
    statistics.validSampleCount >=
    tuning.missionStatistics.minimumValidSampleCount
  const averageIsSufficient =
    sampleCountIsSufficient &&
    statistics.bpmCoverageDurationMs >=
      tuning.missionStatistics.minimumUsableDurationMs
  const percentagesAreSufficient =
    sampleCountIsSufficient &&
    classifiedDurationMs >= tuning.missionStatistics.minimumUsableDurationMs

  return validateMissionResult({
    schemaVersion: MISSION_RESULT_SCHEMA_VERSION,
    outcome: mission.status.outcome,
    startedAtTimeMs: statistics.startedAtTimeMs,
    finalizedAtTimeMs: mission.status.finalizedAtTimeMs,
    missionDurationMs:
      mission.status.finalizedAtTimeMs - statistics.startedAtTimeMs,
    activeDurationMs: mission.activeElapsedTimeMs,
    suspendedDurationMs: durations.suspended,
    targetRange,
    validSampleCount: statistics.validSampleCount,
    minimumBpm: statistics.minimumBpm,
    averageBpm: averageIsSufficient
      ? statistics.weightedBpmMilliseconds / statistics.bpmCoverageDurationMs
      : null,
    peakBpm: statistics.peakBpm,
    belowRangeDurationMs: durations.belowRange,
    operationalDurationMs: durations.operational,
    aboveRangeDurationMs: durations.aboveRange,
    unclassifiedDurationMs: durations.unclassified,
    unusableSignalDurationMs: durations.unusableSignal,
    belowRangePercentage: percentagesAreSufficient
      ? percentage(durations.belowRange, classifiedDurationMs)
      : null,
    operationalPercentage: percentagesAreSufficient
      ? percentage(durations.operational, classifiedDurationMs)
      : null,
    aboveRangePercentage: percentagesAreSufficient
      ? percentage(durations.aboveRange, classifiedDurationMs)
      : null,
    lowOutputEpisodeCount: statistics.lowOutputEpisodeCount,
    overloadEpisodeCount: statistics.overloadEpisodeCount,
    endingStability: mission.stability,
    pauseCount: statistics.pauseCount,
    disconnectCount: statistics.disconnectCount,
    disconnectedDurationMs: statistics.disconnectedDurationMs,
    puzzleMoveCount: statistics.puzzleMoveCount,
    hintUsed: statistics.hintUsed,
    puzzleCompleted: statistics.puzzleCompleted,
  })
}

/**
 * Gate 7A consumes every ordered fact first. Statistics see the fact only when
 * Gate 7A applied it at its timestamp; a failure strictly before that timestamp
 * closes open segments without applying the preempted observation.
 */
export function advanceMissionSession(
  state: MissionSessionState,
  fact: MissionSessionFact,
  tuning: GameplayTuning,
): MissionSessionState {
  if (state.result !== null) return state
  validateGameplayTuning(tuning)
  const missionTransition = transitionMission(
    state.mission,
    gateFact(fact),
    tuning.stability,
  )
  const statistics = transitionMissionStatistics(
    state.statistics,
    missionTransition,
    fact,
    tuning,
  )
  const mission = missionTransition.state
  const result =
    mission.status.phase === 'finalized'
      ? createResult(mission, statistics, state.targetRange, tuning)
      : null
  return { ...state, mission, statistics, result }
}

export function requireMissionResult(
  state: MissionSessionState,
): MissionResult {
  if (state.result === null) {
    throw new Error('Mission result is unavailable before finalization')
  }
  return state.result
}
