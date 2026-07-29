import type { HeartRateClassifierTuning } from '../../config/gameplayTuning'
import { isValidHeartRateBpm } from './range'

export type RangeClassification = 'below' | 'operational' | 'above'
export type SignalQuality = 'insufficient' | 'usable' | 'stale' | 'invalid'
export type ClassifierInvalidationReason =
  | 'disconnect'
  | 'hidden'
  | 'manualSuspension'
  | 'replay'
  | 'targetRangeChanged'
  | 'invalidSignal'
  | 'staleSignal'
  | 'invalidSample'

export interface TargetRange {
  readonly lowerBpm: number
  readonly upperBpm: number
}

interface FilterSample {
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
  readonly filterSamples: readonly FilterSample[]
  readonly validSampleTimesMs: readonly number[]
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
  /**
   * Signal authority changes in effective-time order. A late external fact can
   * therefore project a derived deadline before it applies the fact itself.
   */
  readonly projections: readonly ClassifierProjection[]
}

export interface ClassifierProjection {
  readonly occurrenceTimeMs: number
  readonly signalQuality: SignalQuality
  readonly stableClassification: RangeClassification | null
}

export function validateTargetRange(
  range: TargetRange,
  tuning: HeartRateClassifierTuning,
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
    filterSamples: [],
    validSampleTimesMs: [],
    lastInvalidationReason: null,
  }
}

function assertTime(time: number): void {
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError('Occurrence time must be finite and nonnegative')
  }
}

function median(samples: readonly FilterSample[]): number {
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
    filterSamples: [],
    validSampleTimesMs: [],
    lastInvalidationReason: reason,
  }
}

function evaluateAt(
  state: ClassifierState,
  time: number,
  range: TargetRange,
  tuning: HeartRateClassifierTuning,
): ClassifierTransition {
  if (
    state.latestValidSampleTimeMs !== null &&
    time - state.latestValidSampleTimeMs >= tuning.staleAfterMs
  ) {
    return {
      state: invalidate(state, time, 'stale', 'staleSignal'),
      classificationChange: null,
      projections: [],
    }
  }

  const filterSamples = state.filterSamples.filter(
    (sample) => time - sample.occurrenceTimeMs <= tuning.filterWindowMs,
  )
  const validSampleTimesMs = state.validSampleTimesMs.filter(
    (sampleTime) => time - sampleTime <= tuning.validDataDensityWindowMs,
  )
  if (validSampleTimesMs.length < tuning.minimumValidSamplesInDensityWindow) {
    return {
      state: {
        ...state,
        lastProcessedTimeMs: time,
        signalQuality: 'insufficient',
        stableClassification: null,
        candidateClassification: null,
        candidateSinceMs: null,
        filterSamples,
        validSampleTimesMs,
      },
      classificationChange: null,
      projections: [],
    }
  }

  const filteredBpm = state.filteredBpm
  if (filteredBpm === null) {
    throw new Error('Sufficient valid-data density requires a filtered BPM')
  }
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
        filterSamples,
        validSampleTimesMs,
        lastInvalidationReason: null,
      },
      classificationChange: {
        kind: previous === null ? 'established' : 'changed',
        previous,
        current: candidateClassification,
        occurrenceTimeMs: time,
      },
      projections: [],
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
      filterSamples,
      validSampleTimesMs,
    },
    classificationChange: null,
    projections: [],
  }
}

function advance(
  state: ClassifierState,
  time: number,
  range: TargetRange,
  tuning: HeartRateClassifierTuning,
): ClassifierTransition {
  assertTime(time)
  if (time < state.lastProcessedTimeMs) {
    throw new RangeError(
      'Classifier facts must be processed in monotonic order',
    )
  }

  let classificationChange: ClassificationChange | null = null
  const projections: ClassifierProjection[] = []
  const candidateDeadline =
    state.candidateSinceMs === null
      ? null
      : state.candidateSinceMs + tuning.classificationDwellMs
  const staleDeadline =
    state.latestValidSampleTimeMs === null
      ? null
      : state.latestValidSampleTimeMs + tuning.staleAfterMs

  function evaluateAndCollect(effectiveTimeMs: number): void {
    const before = state
    const transition = evaluateAt(state, effectiveTimeMs, range, tuning)
    state = transition.state
    classificationChange ??= transition.classificationChange
    if (
      before.signalQuality !== state.signalQuality ||
      before.stableClassification !== state.stableClassification
    ) {
      projections.push({
        occurrenceTimeMs: effectiveTimeMs,
        signalQuality: state.signalQuality,
        stableClassification: state.stableClassification,
      })
    }
  }

  // A scheduler wake-up is only a prompt. Preserve pending dwell and stale
  // effects at their derived deadlines before evaluating the requested time.
  if (
    candidateDeadline !== null &&
    candidateDeadline > state.lastProcessedTimeMs &&
    candidateDeadline <= time &&
    (staleDeadline === null || candidateDeadline < staleDeadline)
  ) {
    evaluateAndCollect(candidateDeadline)
  }

  if (
    staleDeadline !== null &&
    staleDeadline > state.lastProcessedTimeMs &&
    staleDeadline <= time
  ) {
    evaluateAndCollect(staleDeadline)
  }

  evaluateAndCollect(time)
  return {
    state,
    classificationChange,
    projections,
  }
}

export function transitionClassifier(
  state: ClassifierState,
  fact: ClassifierFact,
  range: TargetRange,
  tuning: HeartRateClassifierTuning,
): ClassifierTransition {
  validateTargetRange(range, tuning)
  const advanced = advance(state, fact.occurrenceTimeMs, range, tuning)
  state = advanced.state
  if (fact.type === 'timeAdvanced') return advanced
  if (fact.type === 'invalidate') {
    const invalidated = invalidate(
      state,
      fact.occurrenceTimeMs,
      'insufficient',
      fact.reason,
    )
    const projection =
      state.signalQuality === invalidated.signalQuality &&
      state.stableClassification === invalidated.stableClassification
        ? []
        : [
            {
              occurrenceTimeMs: fact.occurrenceTimeMs,
              signalQuality: invalidated.signalQuality,
              stableClassification: invalidated.stableClassification,
            },
          ]
    return {
      state: invalidated,
      classificationChange: advanced.classificationChange,
      projections: [...advanced.projections, ...projection],
    }
  }
  if (
    !isValidHeartRateBpm(fact.bpm) ||
    fact.bpm < tuning.plausibleBpm.minimum ||
    fact.bpm > tuning.plausibleBpm.maximum
  ) {
    const invalidated = invalidate(
      state,
      fact.occurrenceTimeMs,
      'invalid',
      'invalidSample',
    )
    const projection =
      state.signalQuality === invalidated.signalQuality &&
      state.stableClassification === invalidated.stableClassification
        ? []
        : [
            {
              occurrenceTimeMs: fact.occurrenceTimeMs,
              signalQuality: invalidated.signalQuality,
              stableClassification: invalidated.stableClassification,
            },
          ]
    return {
      state: invalidated,
      classificationChange: advanced.classificationChange,
      projections: [...advanced.projections, ...projection],
    }
  }

  const filterCutoff = fact.occurrenceTimeMs - tuning.filterWindowMs
  const filterSamples = [
    ...state.filterSamples.filter(
      (sample) => sample.occurrenceTimeMs >= filterCutoff,
    ),
    { occurrenceTimeMs: fact.occurrenceTimeMs, bpm: fact.bpm },
  ].slice(-tuning.filterSampleLimit)
  const densityCutoff = fact.occurrenceTimeMs - tuning.validDataDensityWindowMs
  const validSampleTimesMs = [
    ...state.validSampleTimesMs.filter(
      (sampleTime) => sampleTime >= densityCutoff,
    ),
    fact.occurrenceTimeMs,
  ].slice(-tuning.minimumValidSamplesInDensityWindow)
  const withSample: ClassifierState = {
    ...state,
    latestValidBpm: fact.bpm,
    latestValidSampleTimeMs: fact.occurrenceTimeMs,
    filteredBpm: median(filterSamples),
    filterSamples,
    validSampleTimesMs,
  }
  const result = advance(withSample, fact.occurrenceTimeMs, range, tuning)
  return {
    state: result.state,
    classificationChange:
      result.classificationChange ?? advanced.classificationChange,
    projections: [...advanced.projections, ...result.projections],
  }
}
