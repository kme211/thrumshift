import type { GameplayTuning } from '../../config/gameplayTuning'
import type {
  RangeClassification,
  SignalQuality,
} from '../heart-rate/classifier'
import { isValidHeartRateBpm } from '../heart-rate/range'
import type {
  ActiveMissionTransition,
  MissionClassifierTransition,
  MissionIntervalBehavior,
} from './activeMission'

interface OrderedSessionFact {
  readonly occurrenceTimeMs: number
  readonly sequence: number
}

export type MissionSessionFact = OrderedSessionFact &
  (
    | { readonly type: 'timeAdvanced' }
    | {
        readonly type: 'classifierUpdated'
        readonly signalQuality: SignalQuality
        readonly stableClassification: RangeClassification | null
      }
    | { readonly type: 'heartRateSample'; readonly bpm: number }
    | {
        readonly type: 'lifecycleProjectionChanged'
        readonly suspended: boolean
        readonly disconnected: boolean
      }
    | { readonly type: 'puzzleTileRotated' }
    /** Requesting or displaying a useful hint constitutes hint use. */
    | { readonly type: 'puzzleHintRequested' }
    /** Reset changes no metric: moves and prior hint use remain cumulative. */
    | { readonly type: 'puzzleReset' }
    | { readonly type: 'puzzleCompleted' }
  )

export type MissionDurationCategory =
  | 'belowRange'
  | 'operational'
  | 'aboveRange'
  | 'unclassified'
  | 'unusableSignal'
  | 'suspended'

export type MissionDurationTotals = Readonly<
  Record<MissionDurationCategory, number>
>

interface DurationSegment {
  readonly behavior: MissionIntervalBehavior
  readonly startedAtTimeMs: number
}

interface BpmSegment {
  readonly bpm: number
  readonly startedAtTimeMs: number
}

export interface MissionStatisticsState {
  readonly startedAtTimeMs: number
  readonly completedDurationsMs: MissionDurationTotals
  readonly durationSegment: DurationSegment | null
  readonly disconnected: boolean
  readonly disconnectedSinceTimeMs: number | null
  readonly disconnectedDurationMs: number
  readonly pauseCount: number
  readonly disconnectCount: number
  readonly episodeClassification: RangeClassification | null
  readonly suppressNextEstablishedEpisode: boolean
  readonly lowOutputEpisodeCount: number
  readonly overloadEpisodeCount: number
  readonly validSampleCount: number
  readonly minimumBpm: number | null
  readonly peakBpm: number | null
  readonly latestQualifyingBpm: number | null
  readonly bpmSegment: BpmSegment | null
  readonly weightedBpmMilliseconds: number
  readonly bpmCoverageDurationMs: number
  readonly puzzleMoveCount: number
  readonly hintUsed: boolean
  readonly puzzleCompleted: boolean
}

const EMPTY_DURATIONS: MissionDurationTotals = {
  belowRange: 0,
  operational: 0,
  aboveRange: 0,
  unclassified: 0,
  unusableSignal: 0,
  suspended: 0,
}

function durationCategory(
  behavior: MissionIntervalBehavior,
): MissionDurationCategory {
  if (behavior === 'activeBelowRange') return 'belowRange'
  if (behavior === 'activeOperational') return 'operational'
  if (behavior === 'activeAboveRange') return 'aboveRange'
  return behavior
}

function hasUsableBpmCoverage(behavior: MissionIntervalBehavior): boolean {
  return behavior !== 'suspended' && behavior !== 'unusableSignal'
}

function acceptsActiveSample(behavior: MissionIntervalBehavior): boolean {
  return behavior !== 'suspended'
}

export function createMissionStatisticsState(
  initialTimeMs: number,
  initialBehavior: MissionIntervalBehavior,
): MissionStatisticsState {
  return {
    startedAtTimeMs: initialTimeMs,
    completedDurationsMs: EMPTY_DURATIONS,
    durationSegment: {
      behavior: initialBehavior,
      startedAtTimeMs: initialTimeMs,
    },
    disconnected: false,
    disconnectedSinceTimeMs: null,
    disconnectedDurationMs: 0,
    pauseCount: 0,
    disconnectCount: 0,
    episodeClassification: null,
    suppressNextEstablishedEpisode: false,
    lowOutputEpisodeCount: 0,
    overloadEpisodeCount: 0,
    validSampleCount: 0,
    minimumBpm: null,
    peakBpm: null,
    latestQualifyingBpm: null,
    bpmSegment: null,
    weightedBpmMilliseconds: 0,
    bpmCoverageDurationMs: 0,
    puzzleMoveCount: 0,
    hintUsed: false,
    puzzleCompleted: false,
  }
}

function closeDurationSegment(
  state: MissionStatisticsState,
  time: number,
): MissionStatisticsState {
  const segment = state.durationSegment
  if (segment === null) return state
  const elapsedMs = time - segment.startedAtTimeMs
  const category = durationCategory(segment.behavior)
  return {
    ...state,
    completedDurationsMs: {
      ...state.completedDurationsMs,
      [category]: state.completedDurationsMs[category] + elapsedMs,
    },
    durationSegment: null,
  }
}

function closeBpmSegment(
  state: MissionStatisticsState,
  time: number,
): MissionStatisticsState {
  const segment = state.bpmSegment
  if (segment === null) return state
  const elapsedMs = time - segment.startedAtTimeMs
  return {
    ...state,
    bpmSegment: null,
    weightedBpmMilliseconds:
      state.weightedBpmMilliseconds + segment.bpm * elapsedMs,
    bpmCoverageDurationMs: state.bpmCoverageDurationMs + elapsedMs,
  }
}

function isQualifyingSample(
  bpm: number,
  behavior: MissionIntervalBehavior,
  tuning: GameplayTuning,
): boolean {
  // Raw sample metrics retain plausible integer samples during active play,
  // including density-building samples before signal becomes usable. Samples
  // received while suspended never affect the run or seed later BPM coverage.
  return (
    acceptsActiveSample(behavior) &&
    isValidHeartRateBpm(bpm) &&
    bpm >= tuning.heartRateClassifier.plausibleBpm.minimum &&
    bpm <= tuning.heartRateClassifier.plausibleBpm.maximum
  )
}

function applySample(
  state: MissionStatisticsState,
  bpm: number,
): MissionStatisticsState {
  return {
    ...state,
    validSampleCount: state.validSampleCount + 1,
    minimumBpm:
      state.minimumBpm === null ? bpm : Math.min(state.minimumBpm, bpm),
    peakBpm: state.peakBpm === null ? bpm : Math.max(state.peakBpm, bpm),
    latestQualifyingBpm: bpm,
  }
}

function applyEpisodeTransition(
  state: MissionStatisticsState,
  transition: MissionClassifierTransition,
  resultingBehavior: MissionIntervalBehavior,
): MissionStatisticsState {
  if (transition.kind === 'invalidated') {
    return {
      ...state,
      episodeClassification: null,
      suppressNextEstablishedEpisode: true,
    }
  }
  const current = transition.current
  const suspended = resultingBehavior === 'suspended'
  const suppress =
    suspended ||
    (transition.kind === 'established' && state.suppressNextEstablishedEpisode)
  return {
    ...state,
    episodeClassification: current,
    suppressNextEstablishedEpisode: false,
    lowOutputEpisodeCount:
      !suppress && current === 'below'
        ? state.lowOutputEpisodeCount + 1
        : state.lowOutputEpisodeCount,
    overloadEpisodeCount:
      !suppress && current === 'above'
        ? state.overloadEpisodeCount + 1
        : state.overloadEpisodeCount,
  }
}

export function assertLifecycleProjection(
  projection: Readonly<{ suspended: boolean; disconnected: boolean }>,
): void {
  if (
    typeof projection.suspended !== 'boolean' ||
    typeof projection.disconnected !== 'boolean' ||
    (projection.disconnected && !projection.suspended)
  ) {
    throw new RangeError(
      'Mission lifecycle projection requires booleans and cannot be disconnected while active',
    )
  }
}

function applyLifecycleProjection(
  state: MissionStatisticsState,
  projection: Readonly<{ suspended: boolean; disconnected: boolean }>,
  previousBehavior: MissionIntervalBehavior,
  time: number,
): MissionStatisticsState {
  // Pause duration is the union of all reasons through the duration category;
  // disconnect duration independently follows membership of that one reason.
  assertLifecycleProjection(projection)
  const wasSuspended = previousBehavior === 'suspended'
  const wasDisconnected = state.disconnected
  let disconnectedDurationMs = state.disconnectedDurationMs
  let disconnectedSinceTimeMs = state.disconnectedSinceTimeMs
  if (wasDisconnected && !projection.disconnected) {
    if (disconnectedSinceTimeMs === null) {
      throw new Error('Disconnected statistics require a segment anchor')
    }
    disconnectedDurationMs += time - disconnectedSinceTimeMs
    disconnectedSinceTimeMs = null
  } else if (!wasDisconnected && projection.disconnected) {
    disconnectedSinceTimeMs = time
  }
  return {
    ...state,
    disconnected: projection.disconnected,
    pauseCount:
      !wasSuspended && projection.suspended
        ? state.pauseCount + 1
        : state.pauseCount,
    disconnectCount:
      !wasDisconnected && projection.disconnected
        ? state.disconnectCount + 1
        : state.disconnectCount,
    disconnectedDurationMs,
    disconnectedSinceTimeMs,
  }
}

function closeDisconnectedSegment(
  state: MissionStatisticsState,
  time: number,
): MissionStatisticsState {
  if (state.disconnectedSinceTimeMs === null) return state
  return {
    ...state,
    disconnectedDurationMs:
      state.disconnectedDurationMs + (time - state.disconnectedSinceTimeMs),
    disconnectedSinceTimeMs: null,
  }
}

/**
 * Applies one fact only after Gate 7A has accepted its ordering. Scheduler
 * facts never close anchors; only behavior changes, samples, and finalization
 * do, which keeps totals independent of wake-up partitioning.
 */
export function transitionMissionStatistics(
  state: MissionStatisticsState,
  missionTransition: ActiveMissionTransition,
  fact: MissionSessionFact,
  tuning: GameplayTuning,
): MissionStatisticsState {
  const interval = missionTransition.interval
  if (interval === null) return state
  const transitionTimeMs = interval.endedAtTimeMs
  const finalized = missionTransition.state.status.phase === 'finalized'
  const factWasApplied = missionTransition.factDisposition === 'accepted'
  if (
    finalized ||
    (factWasApplied &&
      state.durationSegment?.behavior !== missionTransition.resultingBehavior)
  ) {
    state = closeDurationSegment(state, transitionTimeMs)
    if (!finalized) {
      state = {
        ...state,
        durationSegment: {
          behavior: missionTransition.resultingBehavior,
          startedAtTimeMs: transitionTimeMs,
        },
      }
    }
  }

  const qualifyingSample =
    factWasApplied &&
    fact.type === 'heartRateSample' &&
    isQualifyingSample(fact.bpm, missionTransition.resultingBehavior, tuning)
  const coverageChanged =
    factWasApplied &&
    hasUsableBpmCoverage(interval.behavior) !==
      hasUsableBpmCoverage(missionTransition.resultingBehavior)
  if (finalized || qualifyingSample || coverageChanged) {
    state = closeBpmSegment(state, transitionTimeMs)
  }

  if (factWasApplied) {
    if (fact.type === 'heartRateSample' && qualifyingSample) {
      state = applySample(state, fact.bpm)
    } else if (
      fact.type === 'classifierUpdated' &&
      missionTransition.classifierTransition !== null
    ) {
      state = applyEpisodeTransition(
        state,
        missionTransition.classifierTransition,
        missionTransition.resultingBehavior,
      )
    } else if (fact.type === 'lifecycleProjectionChanged') {
      state = applyLifecycleProjection(
        state,
        fact,
        interval.behavior,
        transitionTimeMs,
      )
    } else if (fact.type === 'puzzleTileRotated') {
      state = { ...state, puzzleMoveCount: state.puzzleMoveCount + 1 }
    } else if (fact.type === 'puzzleHintRequested') {
      state = { ...state, hintUsed: true }
    } else if (fact.type === 'puzzleCompleted') {
      state = { ...state, puzzleCompleted: true }
    }
  }

  if (
    factWasApplied &&
    ((interval.behavior !== 'suspended' &&
      missionTransition.resultingBehavior === 'suspended') ||
      (interval.behavior !== 'unusableSignal' &&
        missionTransition.resultingBehavior === 'unusableSignal'))
  ) {
    state = { ...state, latestQualifyingBpm: null }
  }

  if (
    !finalized &&
    state.bpmSegment === null &&
    state.latestQualifyingBpm !== null &&
    hasUsableBpmCoverage(missionTransition.resultingBehavior)
  ) {
    state = {
      ...state,
      bpmSegment: {
        bpm: state.latestQualifyingBpm,
        startedAtTimeMs: transitionTimeMs,
      },
    }
  }

  return finalized ? closeDisconnectedSegment(state, transitionTimeMs) : state
}
