import type { CountdownTuning, WarmupTuning } from '../../config/gameplayTuning'
import type {
  RangeClassification,
  SignalQuality,
} from '../heart-rate/classifier'

export type WarmupStage = 'warming' | 'countdown' | 'complete'

export interface WarmupState {
  readonly lastProcessedTimeMs: number
  readonly phase: WarmupStage
  readonly signalQuality: SignalQuality
  readonly stableClassification: RangeClassification | null
  readonly operationalSinceMs: number | null
  readonly qualifiedAtMs: number | null
  readonly countdownStartedAtMs: number | null
  readonly completedAtMs: number | null
}

export type WarmupFact =
  | { readonly type: 'timeAdvanced'; readonly occurrenceTimeMs: number }
  | {
      readonly type: 'classifierUpdated'
      readonly occurrenceTimeMs: number
      readonly signalQuality: SignalQuality
      readonly stableClassification: RangeClassification | null
    }
  | {
      readonly type: 'invalidate'
      readonly occurrenceTimeMs: number
      readonly reason:
        | 'disconnect'
        | 'hidden'
        | 'manualSuspension'
        | 'staleSignal'
        | 'invalidSignal'
        | 'replay'
        | 'targetRangeChanged'
    }

export function createWarmupState(initialTimeMs: number): WarmupState {
  if (!Number.isFinite(initialTimeMs) || initialTimeMs < 0) {
    throw new RangeError('Initial time must be finite and nonnegative')
  }
  return {
    lastProcessedTimeMs: initialTimeMs,
    phase: 'warming',
    signalQuality: 'insufficient',
    stableClassification: null,
    operationalSinceMs: null,
    qualifiedAtMs: null,
    countdownStartedAtMs: null,
    completedAtMs: null,
  }
}

function advanceWarmup(
  state: WarmupState,
  time: number,
  warmupTuning: WarmupTuning,
  countdownTuning: CountdownTuning,
): WarmupState {
  if (!Number.isFinite(time) || time < state.lastProcessedTimeMs) {
    throw new RangeError('Warm-up facts must be processed in monotonic order')
  }
  if (state.phase === 'complete') return state

  let next = { ...state, lastProcessedTimeMs: time }
  if (
    next.phase === 'warming' &&
    next.signalQuality === 'usable' &&
    next.stableClassification === 'operational' &&
    next.operationalSinceMs !== null
  ) {
    const qualifiedAtMs = next.operationalSinceMs + warmupTuning.qualificationMs
    if (time >= qualifiedAtMs) {
      next = {
        ...next,
        phase: 'countdown',
        qualifiedAtMs,
        countdownStartedAtMs: qualifiedAtMs,
      }
    }
  }
  if (
    next.phase === 'countdown' &&
    next.countdownStartedAtMs !== null &&
    time >= next.countdownStartedAtMs + countdownTuning.durationMs
  ) {
    const completedAtMs = next.countdownStartedAtMs + countdownTuning.durationMs
    return { ...next, phase: 'complete', completedAtMs }
  }
  return next
}

function reset(
  state: WarmupState,
  time: number,
  signalQuality: SignalQuality,
  stableClassification: RangeClassification | null,
): WarmupState {
  return {
    ...state,
    lastProcessedTimeMs: time,
    phase: 'warming',
    signalQuality,
    stableClassification,
    operationalSinceMs: null,
    qualifiedAtMs: null,
    countdownStartedAtMs: null,
    completedAtMs: null,
  }
}

export function transitionWarmup(
  state: WarmupState,
  fact: WarmupFact,
  warmupTuning: WarmupTuning,
  countdownTuning: CountdownTuning,
): WarmupState {
  const advanced = advanceWarmup(
    state,
    fact.occurrenceTimeMs,
    warmupTuning,
    countdownTuning,
  )
  if (advanced.phase === 'complete' || fact.type === 'timeAdvanced') {
    return advanced
  }
  if (fact.type === 'invalidate') {
    return reset(advanced, fact.occurrenceTimeMs, 'insufficient', null)
  }
  const operational =
    fact.signalQuality === 'usable' &&
    fact.stableClassification === 'operational'
  if (!operational) {
    return reset(
      advanced,
      fact.occurrenceTimeMs,
      fact.signalQuality,
      fact.stableClassification,
    )
  }
  return {
    ...advanced,
    signalQuality: fact.signalQuality,
    stableClassification: fact.stableClassification,
    operationalSinceMs: advanced.operationalSinceMs ?? fact.occurrenceTimeMs,
  }
}

export function getWarmupProgressMs(
  state: WarmupState,
  qualificationMs: number,
): number {
  if (state.qualifiedAtMs !== null) return qualificationMs
  if (state.operationalSinceMs === null) return 0
  return Math.min(
    qualificationMs,
    Math.max(0, state.lastProcessedTimeMs - state.operationalSinceMs),
  )
}

export function getCountdownRemainingMs(
  state: WarmupState,
  countdownMs: number,
): number | null {
  if (state.phase !== 'countdown' || state.countdownStartedAtMs === null) {
    return null
  }
  return Math.max(
    0,
    state.countdownStartedAtMs + countdownMs - state.lastProcessedTimeMs,
  )
}
