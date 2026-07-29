import type { GameplayTuning } from '../config/gameplayTuning'
import {
  createClassifierState,
  transitionClassifier,
  validateTargetRange,
} from '../domain/heart-rate/classifier'
import type {
  ClassifierFact,
  ClassifierInvalidationReason,
  ClassifierState,
  TargetRange,
} from '../domain/heart-rate/classifier'
import { createWarmupState, transitionWarmup } from '../domain/mission/warmup'
import type { WarmupFact, WarmupState } from '../domain/mission/warmup'

export type WarmupSessionTuning = Pick<
  GameplayTuning,
  'heartRateClassifier' | 'warmup' | 'countdown'
>

export interface WarmupSession {
  readonly targetRange: TargetRange
  readonly classifier: ClassifierState
  readonly warmup: WarmupState
}

export function createWarmupSession(
  occurredAt: number,
  targetRange: TargetRange,
  tuning: WarmupSessionTuning,
): WarmupSession {
  validateTargetRange(targetRange, tuning.heartRateClassifier)
  return {
    targetRange,
    classifier: createClassifierState(occurredAt),
    warmup: createWarmupState(occurredAt),
  }
}

export function advanceWarmupSession(
  session: WarmupSession,
  classifierFact: ClassifierFact,
  tuning: WarmupSessionTuning,
  warmupFact?: WarmupFact,
): WarmupSession {
  const classifier = transitionClassifier(
    session.classifier,
    classifierFact,
    session.targetRange,
    tuning.heartRateClassifier,
  ).state
  const fact: WarmupFact = warmupFact ?? {
    type: 'classifierUpdated',
    occurrenceTimeMs: classifierFact.occurrenceTimeMs,
    signalQuality: classifier.signalQuality,
    stableClassification: classifier.stableClassification,
  }
  return {
    ...session,
    classifier,
    warmup: transitionWarmup(
      session.warmup,
      fact,
      tuning.warmup,
      tuning.countdown,
    ),
  }
}

export function invalidateWarmupSession(
  session: WarmupSession,
  occurredAt: number,
  reason: Exclude<
    ClassifierInvalidationReason,
    'staleSignal' | 'invalidSample'
  >,
  warmupReason: Extract<WarmupFact, { type: 'invalidate' }>['reason'],
  tuning: WarmupSessionTuning,
): WarmupSession {
  return advanceWarmupSession(
    session,
    { type: 'invalidate', occurrenceTimeMs: occurredAt, reason },
    tuning,
    { type: 'invalidate', occurrenceTimeMs: occurredAt, reason: warmupReason },
  )
}
