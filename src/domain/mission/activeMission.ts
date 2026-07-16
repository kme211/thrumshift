import {
  validateStabilityTuning,
  type StabilityTuning,
} from '../../config/gameplayTuning'
import type {
  RangeClassification,
  SignalQuality,
} from '../heart-rate/classifier'
import { integrateStability } from './stability'

export type MissionPlayState = 'active' | 'suspended'
export type MissionOutcome = 'success' | 'failure'

export type MissionIntervalBehavior =
  | 'activeBelowRange'
  | 'activeOperational'
  | 'activeAboveRange'
  | 'suspended'
  | 'unusableSignal'
  | 'unclassified'

export interface ProcessedMissionInterval {
  readonly startedAtTimeMs: number
  readonly endedAtTimeMs: number
  readonly durationMs: number
  readonly behavior: MissionIntervalBehavior
}

export type MissionFactDisposition =
  'accepted' | 'preemptedByFinalization' | 'ignoredAfterFinalization'

export type MissionClassifierTransition =
  | {
      readonly kind: 'established'
      readonly previous: null
      readonly current: RangeClassification
    }
  | {
      readonly kind: 'changed'
      readonly previous: RangeClassification
      readonly current: RangeClassification
    }
  | {
      readonly kind: 'invalidated'
      readonly previous: RangeClassification
      readonly current: null
    }

export interface ActiveMissionTransition {
  readonly state: ActiveMissionState
  readonly interval: ProcessedMissionInterval | null
  readonly factDisposition: MissionFactDisposition
  readonly classifierTransition: MissionClassifierTransition | null
  readonly resultingBehavior: MissionIntervalBehavior
}

export type MissionStatus =
  | { readonly phase: 'ongoing' }
  | {
      readonly phase: 'finalized'
      readonly outcome: MissionOutcome
      readonly finalizedAtTimeMs: number
      readonly finalizedBySequence: number
    }

export interface StabilitySegmentAnchor {
  readonly startedAtTimeMs: number
  readonly stability: number
  readonly activeElapsedTimeMs: number
}

export interface ActiveMissionState {
  /** The sole canonical mission-timeline cursor. */
  readonly lastProcessedTimeMs: number
  /** Global composition-root sequence of the last fact consumed. */
  readonly lastProcessedSequence: number
  readonly activeElapsedTimeMs: number
  readonly stability: number
  /** Canonical origin for projection across scheduler wake-up partitions. */
  readonly stabilitySegmentAnchor: StabilitySegmentAnchor
  readonly playState: MissionPlayState
  readonly signalQuality: SignalQuality
  readonly stableClassification: RangeClassification | null
  readonly status: MissionStatus
}

interface OrderedMissionFact {
  readonly occurrenceTimeMs: number
  readonly sequence: number
}

export type MissionFact = OrderedMissionFact &
  (
    | { readonly type: 'timeAdvanced' }
    | {
        readonly type: 'classifierUpdated'
        readonly signalQuality: SignalQuality
        readonly stableClassification: RangeClassification | null
      }
    | {
        readonly type: 'playStateChanged'
        readonly playState: MissionPlayState
      }
    | { readonly type: 'puzzleCompleted' }
  )

function assertOccurrenceTime(time: number): void {
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError('Occurrence time must be finite and nonnegative')
  }
}

function assertSequence(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new RangeError(
      'Mission fact sequence must be a positive safe integer',
    )
  }
}

export function createActiveMissionState(
  initialTimeMs: number,
  tuning: StabilityTuning,
): ActiveMissionState {
  assertOccurrenceTime(initialTimeMs)
  validateStabilityTuning(tuning)
  return {
    lastProcessedTimeMs: initialTimeMs,
    lastProcessedSequence: 0,
    activeElapsedTimeMs: 0,
    stability: tuning.initial,
    stabilitySegmentAnchor: {
      startedAtTimeMs: initialTimeMs,
      stability: tuning.initial,
      activeElapsedTimeMs: 0,
    },
    playState: 'active',
    signalQuality: 'insufficient',
    stableClassification: null,
    status: { phase: 'ongoing' },
  }
}

function finalize(
  state: ActiveMissionState,
  outcome: MissionOutcome,
  time: number,
  sequence: number,
): ActiveMissionState {
  return {
    ...state,
    lastProcessedTimeMs: time,
    lastProcessedSequence: sequence,
    stabilitySegmentAnchor: {
      startedAtTimeMs: time,
      stability: state.stability,
      activeElapsedTimeMs: state.activeElapsedTimeMs,
    },
    status: {
      phase: 'finalized',
      outcome,
      finalizedAtTimeMs: time,
      finalizedBySequence: sequence,
    },
  }
}

function reanchorStability(
  state: ActiveMissionState,
  time: number,
): ActiveMissionState {
  return {
    ...state,
    stabilitySegmentAnchor: {
      startedAtTimeMs: time,
      stability: state.stability,
      activeElapsedTimeMs: state.activeElapsedTimeMs,
    },
  }
}

export function getMissionIntervalBehavior(
  state: ActiveMissionState,
): MissionIntervalBehavior {
  if (state.playState === 'suspended') return 'suspended'
  if (state.signalQuality !== 'usable') return 'unusableSignal'
  if (state.stableClassification === 'below') return 'activeBelowRange'
  if (state.stableClassification === 'operational') return 'activeOperational'
  if (state.stableClassification === 'above') return 'activeAboveRange'
  return 'unclassified'
}

function behaviorClassification(
  behavior: MissionIntervalBehavior,
): RangeClassification | null {
  if (behavior === 'activeBelowRange') return 'below'
  if (behavior === 'activeOperational') return 'operational'
  if (behavior === 'activeAboveRange') return 'above'
  return null
}

function effectiveClassification(
  state: ActiveMissionState,
): RangeClassification | null {
  return state.signalQuality === 'usable' ? state.stableClassification : null
}

function classifierTransition(
  before: ActiveMissionState,
  after: ActiveMissionState,
  fact: MissionFact,
): MissionClassifierTransition | null {
  if (fact.type !== 'classifierUpdated') return null
  const previous = effectiveClassification(before)
  const current = effectiveClassification(after)
  if (previous === current) return null
  if (previous === null && current !== null) {
    return { kind: 'established', previous, current }
  }
  if (previous !== null && current === null) {
    return { kind: 'invalidated', previous, current }
  }
  if (previous !== null && current !== null) {
    return { kind: 'changed', previous, current }
  }
  return null
}

function processedInterval(
  state: ActiveMissionState,
  endedAtTimeMs: number,
  behavior: MissionIntervalBehavior,
): ProcessedMissionInterval {
  return {
    startedAtTimeMs: state.lastProcessedTimeMs,
    endedAtTimeMs,
    durationMs: endedAtTimeMs - state.lastProcessedTimeMs,
    behavior,
  }
}

function applyFact(
  state: ActiveMissionState,
  fact: MissionFact,
): ActiveMissionState {
  switch (fact.type) {
    case 'timeAdvanced':
      return state
    case 'classifierUpdated':
      return {
        ...state,
        signalQuality: fact.signalQuality,
        stableClassification: fact.stableClassification,
      }
    case 'playStateChanged':
      return { ...state, playState: fact.playState }
    case 'puzzleCompleted':
      return finalize(state, 'success', fact.occurrenceTimeMs, fact.sequence)
  }
}

/**
 * Advances the prior interval, applies one `(occurrenceTime, sequence)` fact,
 * then finalizes an outcome. A failure strictly inside an interval preempts the
 * fact. At an exact endpoint, that timestamp's first fact applies before the
 * boundary is finalized, so equal-time sequence order is authoritative.
 * Finalized states ignore every later fact without consulting browser time.
 */
export function transitionMission(
  state: ActiveMissionState,
  fact: MissionFact,
  tuning: StabilityTuning,
): ActiveMissionTransition {
  if (state.status.phase === 'finalized') {
    return {
      state,
      interval: null,
      factDisposition: 'ignoredAfterFinalization',
      classifierTransition: null,
      resultingBehavior: getMissionIntervalBehavior(state),
    }
  }

  validateStabilityTuning(tuning)
  assertOccurrenceTime(fact.occurrenceTimeMs)
  assertSequence(fact.sequence)
  if (
    fact.occurrenceTimeMs < state.lastProcessedTimeMs ||
    fact.sequence <= state.lastProcessedSequence
  ) {
    throw new RangeError(
      'Mission facts must be processed in monotonic occurrence-time and increasing-sequence order',
    )
  }

  const elapsedMs = fact.occurrenceTimeMs - state.lastProcessedTimeMs
  const behavior = getMissionIntervalBehavior(state)
  let advanced: ActiveMissionState = {
    ...state,
    lastProcessedTimeMs: fact.occurrenceTimeMs,
    lastProcessedSequence: fact.sequence,
  }

  const classification = behaviorClassification(behavior)
  if (elapsedMs > 0 && classification !== null) {
    const integration = integrateStability(
      state.stabilitySegmentAnchor.stability,
      classification,
      fact.occurrenceTimeMs - state.stabilitySegmentAnchor.startedAtTimeMs,
      tuning,
    )
    const failureOffsetMs = integration.failureOffsetMs
    if (failureOffsetMs !== null) {
      const failureTimeMs =
        state.stabilitySegmentAnchor.startedAtTimeMs + failureOffsetMs
      if (failureTimeMs < fact.occurrenceTimeMs) {
        const activeElapsedTimeMs =
          state.stabilitySegmentAnchor.activeElapsedTimeMs + failureOffsetMs
        const finalized = finalize(
          {
            ...state,
            activeElapsedTimeMs,
            stability: tuning.minimum,
          },
          'failure',
          failureTimeMs,
          fact.sequence,
        )
        return {
          state: finalized,
          interval: processedInterval(state, failureTimeMs, behavior),
          factDisposition: 'preemptedByFinalization',
          classifierTransition: null,
          resultingBehavior: getMissionIntervalBehavior(finalized),
        }
      }
    }
    advanced = {
      ...advanced,
      activeElapsedTimeMs:
        state.stabilitySegmentAnchor.activeElapsedTimeMs +
        (fact.occurrenceTimeMs - state.stabilitySegmentAnchor.startedAtTimeMs),
      stability: integration.stability,
    }
    if (
      integration.maximumOffsetMs !== null &&
      integration.maximumOffsetMs > 0
    ) {
      const maximumTimeMs =
        state.stabilitySegmentAnchor.startedAtTimeMs +
        integration.maximumOffsetMs
      advanced = {
        ...advanced,
        stabilitySegmentAnchor: {
          startedAtTimeMs: maximumTimeMs,
          stability: tuning.maximum,
          activeElapsedTimeMs:
            state.stabilitySegmentAnchor.activeElapsedTimeMs +
            integration.maximumOffsetMs,
        },
      }
    }
  }

  let applied = applyFact(advanced, fact)
  const acceptedClassifierTransition = classifierTransition(
    advanced,
    applied,
    fact,
  )
  if (
    applied.status.phase !== 'finalized' &&
    getMissionIntervalBehavior(applied) !== getMissionIntervalBehavior(advanced)
  ) {
    applied = reanchorStability(applied, fact.occurrenceTimeMs)
  }
  const next =
    applied.status.phase === 'ongoing' && applied.stability <= tuning.minimum
      ? finalize(applied, 'failure', fact.occurrenceTimeMs, fact.sequence)
      : applied
  return {
    state: next,
    interval: processedInterval(state, fact.occurrenceTimeMs, behavior),
    factDisposition: 'accepted',
    classifierTransition: acceptedClassifierTransition,
    resultingBehavior: getMissionIntervalBehavior(next),
  }
}

export function advanceMission(
  state: ActiveMissionState,
  fact: MissionFact,
  tuning: StabilityTuning,
): ActiveMissionState {
  return transitionMission(state, fact, tuning).state
}
