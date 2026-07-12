import type {
  AppEvent,
  AppState,
  NonEmptyReasons,
  ResumeTarget,
  SuspensionReason,
} from './AppState'
import { getRunId } from './AppState'

/**
 * Lifecycle transition table. Payload-producing domain transitions happen before
 * these events reach the reducer; the reducer never derives warm-up, mission, or
 * result data. Together with the AppState design contracts, this table documents
 * the reducer boundary that later gates must preserve.
 */
export const appTransitionTable = {
  preMission: ['warmupStarted'],
  warming: ['warmupUpdated', 'countdownStarted', 'suspended', 'runAbandoned'],
  countdown: [
    'countdownUpdated',
    'warmupUpdated',
    'missionStarted',
    'suspended',
    'runAbandoned',
  ],
  activeMission: ['missionUpdated', 'suspended', 'runEnded', 'runAbandoned'],
  suspended: {
    warming: [
      'warmupUpdated',
      'suspended',
      'suspensionCleared (reason present)',
      'warmupRecovered (only manual latch remains)',
      'runAbandoned',
    ],
    countdown: [
      'warmupUpdated',
      'suspended',
      'suspensionCleared (reason present)',
      'warmupRecovered (only manual latch remains)',
      'runAbandoned',
    ],
    activeMission: [
      'missionUpdated',
      'suspended',
      'suspensionCleared (reason present)',
      'resumed (only manual latch remains)',
      'runEnded',
      'runAbandoned',
    ],
  },
  result: ['runAgain'],
} as const

function addReason(
  reasons: NonEmptyReasons,
  reason: SuspensionReason,
): NonEmptyReasons {
  return reasons.includes(reason) ? reasons : [...reasons, reason]
}

function replaceCanonicalState<WarmupState, MissionState>(
  target: ResumeTarget<WarmupState, MissionState>,
  event:
    | Extract<
        AppEvent<WarmupState, MissionState, unknown>,
        { type: 'warmupUpdated' }
      >
    | Extract<
        AppEvent<WarmupState, MissionState, unknown>,
        { type: 'missionUpdated' }
      >,
): ResumeTarget<WarmupState, MissionState> {
  if (event.type === 'warmupUpdated' && target.phase !== 'activeMission') {
    return { ...target, warmup: event.warmup }
  }
  if (event.type === 'missionUpdated' && target.phase === 'activeMission') {
    return { ...target, mission: event.mission }
  }
  return target
}

export function appReducer<WarmupState, MissionState, Result>(
  state: AppState<WarmupState, MissionState, Result>,
  event: AppEvent<WarmupState, MissionState, Result>,
): AppState<WarmupState, MissionState, Result> {
  const runId = getRunId(state)
  if (
    'runId' in event &&
    event.type !== 'warmupStarted' &&
    event.runId !== runId
  ) {
    return state
  }

  switch (state.phase) {
    case 'preMission':
      return event.type === 'warmupStarted'
        ? { phase: 'warming', runId: event.runId, warmup: event.warmup }
        : state

    case 'warming':
      switch (event.type) {
        case 'warmupUpdated':
          return { ...state, warmup: event.warmup }
        case 'countdownStarted':
          return {
            phase: 'countdown',
            runId: state.runId,
            warmup: event.warmup,
          }
        case 'suspended':
          return {
            phase: 'suspended',
            resumeTarget: state,
            reasons: [event.reason],
          }
        case 'runAbandoned':
          return { phase: 'preMission' }
        default:
          return state
      }

    case 'countdown':
      switch (event.type) {
        case 'countdownUpdated':
          return { ...state, warmup: event.warmup }
        case 'warmupUpdated':
          return { phase: 'warming', runId: state.runId, warmup: event.warmup }
        case 'missionStarted':
          return {
            phase: 'activeMission',
            runId: state.runId,
            mission: event.mission,
          }
        case 'suspended':
          return {
            phase: 'suspended',
            resumeTarget: state,
            reasons: [event.reason],
          }
        case 'runAbandoned':
          return { phase: 'preMission' }
        default:
          return state
      }

    case 'activeMission':
      switch (event.type) {
        case 'missionUpdated':
          return { ...state, mission: event.mission }
        case 'suspended':
          return {
            phase: 'suspended',
            resumeTarget: state,
            reasons: [event.reason],
          }
        case 'runEnded':
          return { phase: 'result', runId: state.runId, result: event.result }
        case 'runAbandoned':
          return { phase: 'preMission' }
        default:
          return state
      }

    case 'suspended':
      switch (event.type) {
        case 'warmupUpdated':
        case 'missionUpdated': {
          const resumeTarget = replaceCanonicalState(state.resumeTarget, event)
          return resumeTarget === state.resumeTarget
            ? state
            : { ...state, resumeTarget }
        }
        case 'suspended':
          return { ...state, reasons: addReason(state.reasons, event.reason) }
        case 'suspensionCleared': {
          if (!state.reasons.includes(event.reason)) {
            return state
          }
          const remaining = state.reasons.filter(
            (reason) => reason !== event.reason,
          )
          // Clearing an automatic blocker never resumes. The manual reason is the
          // explicit-resume latch, even when the original pause was automatic.
          const first = remaining[0]
          const reasons: NonEmptyReasons =
            first !== undefined ? [first, ...remaining.slice(1)] : ['manual']
          return { ...state, reasons }
        }
        case 'resumed':
          return state.resumeTarget.phase === 'activeMission' &&
            state.reasons.length === 1 &&
            state.reasons[0] === 'manual'
            ? state.resumeTarget
            : state
        case 'warmupRecovered':
          return state.resumeTarget.phase === 'activeMission' ||
            state.reasons.length !== 1 ||
            state.reasons[0] !== 'manual'
            ? state
            : { phase: 'warming', runId: event.runId, warmup: event.warmup }
        case 'runEnded':
          return state.resumeTarget.phase === 'activeMission'
            ? { phase: 'result', runId: event.runId, result: event.result }
            : state
        case 'runAbandoned':
          return { phase: 'preMission' }
        default:
          return state
      }

    case 'result':
      return event.type === 'runAgain' ? { phase: 'preMission' } : state
  }
}
