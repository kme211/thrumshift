import type { MvpTuning } from '../../config/mvpTuning'
import { isValidHeartRateBpm } from './range'

export type RangeClassification = 'below' | 'operational' | 'above'
export type SignalQuality = 'insufficient' | 'usable' | 'stale' | 'invalid'
export type ClassifierInvalidationReason =
  | 'disconnect'
  | 'hidden'
  | 'manualSuspension'
  | 'replay'
  | 'targetRangeChanged'
  | 'staleSignal'
  | 'invalidSample'

export interface TargetRange {
  readonly lowerBpm: number
  readonly upperBpm: number
}

interface RollingSample {
  readonly occurrenceTimeMs: number
  readonly bpm: number
}

export interface ClassifierState {
  readonly lastProcessedTimeMs: number
  readonly latestValidBpm: number | null
  readonly latestValidSampleTimeMs: number | null
  readonly filteredBpm: number | null
  readonly signalQuality: SignalQuality
  readonly stableClassification: RangeClassification | null
  readonly candidateClassification: RangeClassification | null
  readonly candidateSinceMs: number | null
  readonly rollingSamples: readonly RollingSample[]
  readonly lastInvalidationReason: ClassifierInvalidationReason | null
}

export type ClassifierFact =
  | {
      readonly type: 'sample'
      readonly occurrenceTimeMs: number
      readonly bpm: number
    }
  | { readonly type: 'timeAdvanced'; readonly occurrenceTimeMs: number }
  | {
      readonly type: 'invalidate'
      readonly occurrenceTimeMs: number
      readonly reason: Exclude<
        ClassifierInvalidationReason,
        'staleSignal' | 'invalidSample'
      >
    }

export interface ClassificationChange {
  readonly kind: 'established' | 'changed'
  readonly previous: RangeClassification | null
  readonly current: RangeClassification
  readonly occurrenceTimeMs: number
}

export interface ClassifierTransition {
  readonly state: ClassifierState
  readonly classificationChange: ClassificationChange | null
}

export function validateTargetRange(
  range: TargetRange,
  tuning: MvpTuning['heartRate'],
): TargetRange {
  if (
    !Number.isSafeInteger(range.lowerBpm) ||
    !Number.isSafeInteger(range.upperBpm) ||
    range.lowerBpm < tuning.plausibleBpm.minimum ||
    range.upperBpm > tuning.plausibleBpm.maximum ||
    range.lowerBpm >= range.upperBpm ||
    range.lowerBpm - tuning.hysteresisBpm <= tuning.plausibleBpm.minimum ||
    range.upperBpm + tuning.hysteresisBpm >= tuning.plausibleBpm.maximum
  ) {
    throw new RangeError(
      'Target range must use ordered integer BPM values with reachable hysteresis exits inside gameplay plausibility bounds',
    )
  }
  return range
}

export function createClassifierState(initialTimeMs: number): ClassifierState {
  assertTime(initialTimeMs)
  return {
    lastProcessedTimeMs: initialTimeMs,
    latestValidBpm: null,
    latestValidSampleTimeMs: null,
    filteredBpm: null,
    signalQuality: 'insufficient',
    stableClassification: null,
    candidateClassification: null,
    candidateSinceMs: null,
    rollingSamples: [],
    lastInvalidationReason: null,
  }
}

function assertTime(time: number): void {
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError('Occurrence time must be finite and nonnegative')
  }
}

function median(samples: readonly RollingSample[]): number {
  const bpms = samples.map(({ bpm }) => bpm).sort((a, b) => a - b)
  return bpms[Math.floor(bpms.length / 2)] as number
}

function rawClassification(
  bpm: number,
  stable: RangeClassification | null,
  range: TargetRange,
  hysteresisBpm: number,
): RangeClassification {
  if (stable === 'operational') {
    if (bpm < range.lowerBpm - hysteresisBpm) return 'below'
    if (bpm > range.upperBpm + hysteresisBpm) return 'above'
    return 'operational'
  }
  if (stable === 'below' && bpm < range.lowerBpm) return 'below'
  if (stable === 'above' && bpm > range.upperBpm) return 'above'
  if (bpm < range.lowerBpm) return 'below'
  if (bpm > range.upperBpm) return 'above'
  return 'operational'
}

function invalidate(
  state: ClassifierState,
  time: number,
  quality: SignalQuality,
  reason: ClassifierInvalidationReason,
): ClassifierState {
  return {
    ...state,
    lastProcessedTimeMs: time,
    filteredBpm: null,
    signalQuality: quality,
    stableClassification: null,
    candidateClassification: null,
    candidateSinceMs: null,
    rollingSamples: [],
    lastInvalidationReason: reason,
  }
}

function evaluateAt(
  state: ClassifierState,
  time: number,
  range: TargetRange,
  tuning: MvpTuning['heartRate'],
): ClassifierTransition {
  if (
    state.latestValidSampleTimeMs !== null &&
    time - state.latestValidSampleTimeMs >= tuning.staleAfterMs
  ) {
    return {
      state: invalidate(state, time, 'stale', 'staleSignal'),
      classificationChange: null,
    }
  }

  const rollingSamples = state.rollingSamples.filter(
    (sample) => time - sample.occurrenceTimeMs <= tuning.rollingWindowMs,
  )
  if (rollingSamples.length < tuning.minimumSamplesInWindow) {
    return {
      state: {
        ...state,
        lastProcessedTimeMs: time,
        filteredBpm:
          rollingSamples.length === 0 ? null : median(rollingSamples),
        signalQuality: 'insufficient',
        stableClassification: null,
        candidateClassification: null,
        candidateSinceMs: null,
        rollingSamples,
      },
      classificationChange: null,
    }
  }

  const filteredBpm = median(rollingSamples)
  const proposed = rawClassification(
    filteredBpm,
    state.stableClassification,
    range,
    tuning.hysteresisBpm,
  )
  let candidateClassification = state.candidateClassification
  let candidateSinceMs = state.candidateSinceMs
  if (proposed === state.stableClassification) {
    candidateClassification = null
    candidateSinceMs = null
  } else if (proposed !== candidateClassification) {
    candidateClassification = proposed
    candidateSinceMs = time
  }

  if (
    candidateClassification !== null &&
    candidateSinceMs !== null &&
    time - candidateSinceMs >= tuning.classificationDwellMs
  ) {
    const previous = state.stableClassification
    return {
      state: {
        ...state,
        lastProcessedTimeMs: time,
        filteredBpm,
        signalQuality: 'usable',
        stableClassification: candidateClassification,
        candidateClassification: null,
        candidateSinceMs: null,
        rollingSamples,
        lastInvalidationReason: null,
      },
      classificationChange: {
        kind: previous === null ? 'established' : 'changed',
        previous,
        current: candidateClassification,
        occurrenceTimeMs: time,
      },
    }
  }

  return {
    state: {
      ...state,
      lastProcessedTimeMs: time,
      filteredBpm,
      signalQuality: 'usable',
      candidateClassification,
      candidateSinceMs,
      rollingSamples,
    },
    classificationChange: null,
  }
}

function advance(
  state: ClassifierState,
  time: number,
  range: TargetRange,
  tuning: MvpTuning['heartRate'],
): ClassifierTransition {
  assertTime(time)
  if (time < state.lastProcessedTimeMs) {
    throw new RangeError(
      'Classifier facts must be processed in monotonic order',
    )
  }

  let classificationChange: ClassificationChange | null = null
  const candidateDeadline =
    state.candidateSinceMs === null
      ? null
      : state.candidateSinceMs + tuning.classificationDwellMs
  const staleDeadline =
    state.latestValidSampleTimeMs === null
      ? null
      : state.latestValidSampleTimeMs + tuning.staleAfterMs

  // A scheduler wake-up is only a prompt. Preserve a pending dwell effect at
  // its derived deadline before evaluating later density or stale boundaries.
  if (
    candidateDeadline !== null &&
    candidateDeadline > state.lastProcessedTimeMs &&
    candidateDeadline <= time &&
    (staleDeadline === null || candidateDeadline < staleDeadline)
  ) {
    const atDeadline = evaluateAt(state, candidateDeadline, range, tuning)
    state = atDeadline.state
    classificationChange = atDeadline.classificationChange
  }

  const atRequestedTime = evaluateAt(state, time, range, tuning)
  return {
    state: atRequestedTime.state,
    classificationChange:
      classificationChange ?? atRequestedTime.classificationChange,
  }
}

export function transitionClassifier(
  state: ClassifierState,
  fact: ClassifierFact,
  range: TargetRange,
  tuning: MvpTuning['heartRate'],
): ClassifierTransition {
  validateTargetRange(range, tuning)
  const advanced = advance(state, fact.occurrenceTimeMs, range, tuning)
  state = advanced.state
  if (fact.type === 'timeAdvanced') return advanced
  if (fact.type === 'invalidate') {
    return {
      state: invalidate(
        state,
        fact.occurrenceTimeMs,
        'insufficient',
        fact.reason,
      ),
      classificationChange: advanced.classificationChange,
    }
  }
  if (
    !isValidHeartRateBpm(fact.bpm) ||
    fact.bpm < tuning.plausibleBpm.minimum ||
    fact.bpm > tuning.plausibleBpm.maximum
  ) {
    return {
      state: invalidate(
        state,
        fact.occurrenceTimeMs,
        'invalid',
        'invalidSample',
      ),
      classificationChange: advanced.classificationChange,
    }
  }

  const cutoff = fact.occurrenceTimeMs - tuning.rollingWindowMs
  const rollingSamples = [
    ...state.rollingSamples.filter(
      (sample) => sample.occurrenceTimeMs >= cutoff,
    ),
    { occurrenceTimeMs: fact.occurrenceTimeMs, bpm: fact.bpm },
  ].slice(-tuning.rollingSampleLimit)
  const withSample: ClassifierState = {
    ...state,
    latestValidBpm: fact.bpm,
    latestValidSampleTimeMs: fact.occurrenceTimeMs,
    rollingSamples,
  }
  const result = advance(withSample, fact.occurrenceTimeMs, range, tuning)
  return {
    state: result.state,
    classificationChange:
      result.classificationChange ?? advanced.classificationChange,
  }
}
