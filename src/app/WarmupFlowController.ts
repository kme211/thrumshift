import { defaultGameplayTuning } from '../config/gameplayTuning'
import {
  createClassifierState,
  transitionClassifier,
  validateTargetRange,
} from '../domain/heart-rate/classifier'
import type {
  ClassifierFact,
  ClassifierInvalidationReason,
  ClassifierState,
  RangeClassification,
  TargetRange,
} from '../domain/heart-rate/classifier'
import { isValidHeartRateBpm } from '../domain/heart-rate/range'
import type { HeartRateSample } from '../domain/heart-rate/types'
import {
  createWarmupState,
  getWarmupProgressMs,
  transitionWarmup,
} from '../domain/mission/warmup'
import type { WarmupFact, WarmupState } from '../domain/mission/warmup'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'
import type { AppState } from './AppState'
import { appReducer } from './appReducer'
import type { ShellMissionState, ShellResult } from './ShellState'
import { freshShellMission } from './ShellState'

export interface WarmupSession {
  readonly targetRange: TargetRange
  readonly classifier: ClassifierState
  readonly warmup: WarmupState
}

export type WarmupFlowLifecycle = AppState<
  WarmupSession,
  ShellMissionState,
  ShellResult
>

export interface WarmupFlowState {
  readonly lifecycle: WarmupFlowLifecycle
  readonly targetRange: TargetRange
  readonly targetDraft: { readonly lower: string; readonly upper: string }
  readonly targetError: string | null
  readonly telemetryStatus: TelemetrySourceStatus
  readonly latestPreMissionBpm: number | null
  readonly announcement: string
  readonly runGeneration: number
  readonly diagnosticsEnabled: boolean
  readonly diagnosticLog: readonly WarmupTelemetryDiagnosticEntry[]
  readonly diagnosticSessionStartMs: number | null
  readonly diagnosticLastOccurrenceMs: number | null
  readonly lastAppliedOccurrenceTimeMs: number | null
  readonly lastAppliedSequence: number
}

export interface WarmupTelemetryDiagnosticEntry {
  readonly sequence: number
  readonly occurrenceTimeMs: number
  readonly category: string
  readonly details: Record<string, unknown>
  readonly lifecycleBefore: string
  readonly lifecycleAfter: string
  readonly transportStatus: string
  readonly signalQuality: string
  readonly stableClassification: RangeClassification | null
}

export type WarmupFlowFactPayload =
  | {
      readonly type: 'status'
      readonly occurredAt: number
      readonly status: TelemetrySourceStatus
    }
  | { readonly type: 'sample'; readonly sample: HeartRateSample }
  | {
      readonly type: 'timeAdvanced'
      readonly occurredAt: number
      readonly runGeneration: number
    }
  | {
      readonly type: 'visibility'
      readonly occurredAt: number
      readonly state: 'visible' | 'hidden'
    }
  | { readonly type: 'beginWarmup'; readonly occurredAt: number }
  | {
      readonly type: 'targetDraftChanged'
      readonly occurredAt: number
      readonly field: 'lower' | 'upper'
      readonly value: string
    }
  | { readonly type: 'targetCommitted'; readonly occurredAt: number }
  | { readonly type: 'sourceChanged'; readonly occurredAt: number }
  | { readonly type: 'backToBriefing'; readonly occurredAt: number }
  | { readonly type: 'resetDiagnostics'; readonly occurredAt: number }

export type WarmupFlowFact = WarmupFlowFactPayload & {
  readonly sequence: number
}

const tuning = defaultGameplayTuning

export function createWarmupFlowState(
  diagnosticsEnabled = false,
): WarmupFlowState {
  const targetRange = {
    lowerBpm: tuning.targetRange.defaultLowerBpm,
    upperBpm: tuning.targetRange.defaultUpperBpm,
  }
  return {
    lifecycle: { phase: 'preMission' },
    targetRange,
    targetDraft: {
      lower: String(targetRange.lowerBpm),
      upper: String(targetRange.upperBpm),
    },
    targetError: null,
    telemetryStatus: { state: 'disconnected' },
    latestPreMissionBpm: null,
    announcement: 'Heart-rate monitor disconnected',
    runGeneration: 0,
    diagnosticsEnabled,
    diagnosticLog: [],
    diagnosticSessionStartMs: null,
    diagnosticLastOccurrenceMs: null,
    lastAppliedOccurrenceTimeMs: null,
    lastAppliedSequence: 0,
  }
}

export function createWarmupSession(
  occurredAt: number,
  targetRange: TargetRange,
): WarmupSession {
  validateTargetRange(targetRange, tuning.heartRateClassifier)
  return {
    targetRange,
    classifier: createClassifierState(occurredAt),
    warmup: createWarmupState(occurredAt),
  }
}

function transitionSession(
  session: WarmupSession,
  classifierFact: ClassifierFact,
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

function invalidateSession(
  session: WarmupSession,
  occurredAt: number,
  reason: Exclude<
    ClassifierInvalidationReason,
    'staleSignal' | 'invalidSample'
  >,
  warmupReason: Extract<WarmupFact, { type: 'invalidate' }>['reason'],
): WarmupSession {
  return transitionSession(
    session,
    { type: 'invalidate', occurrenceTimeMs: occurredAt, reason },
    { type: 'invalidate', occurrenceTimeMs: occurredAt, reason: warmupReason },
  )
}

function liveSession(lifecycle: WarmupFlowLifecycle): WarmupSession | null {
  if (lifecycle.phase === 'warming' || lifecycle.phase === 'countdown') {
    return lifecycle.warmup
  }
  if (
    lifecycle.phase === 'suspended' &&
    lifecycle.resumeTarget.phase !== 'activeMission'
  ) {
    return lifecycle.resumeTarget.warmup
  }
  return null
}

function applySession(
  lifecycle: WarmupFlowLifecycle,
  session: WarmupSession,
): WarmupFlowLifecycle {
  const runId =
    lifecycle.phase === 'suspended'
      ? lifecycle.resumeTarget.runId
      : lifecycle.phase === 'preMission'
        ? null
        : lifecycle.runId
  if (runId === null) return lifecycle
  if (session.warmup.phase === 'complete' && lifecycle.phase === 'countdown') {
    return appReducer(lifecycle, {
      type: 'missionStarted',
      runId,
      mission: freshShellMission(),
    })
  }
  if (session.warmup.phase === 'countdown' && lifecycle.phase === 'countdown') {
    return appReducer(lifecycle, {
      type: 'countdownUpdated',
      runId,
      warmup: session,
    })
  }
  let next = appReducer(lifecycle, {
    type: 'warmupUpdated',
    runId,
    warmup: session,
  })
  if (session.warmup.phase === 'countdown' && next.phase === 'warming') {
    next = appReducer(next, {
      type: 'countdownStarted',
      runId,
      warmup: session,
    })
  }
  return next
}

function runIdFor(lifecycle: WarmupFlowLifecycle): string | null {
  return lifecycle.phase === 'preMission'
    ? null
    : lifecycle.phase === 'suspended'
      ? lifecycle.resumeTarget.runId
      : lifecycle.runId
}

function recoverFromStaleSignal(
  lifecycle: WarmupFlowLifecycle,
  session: WarmupSession,
  occurredAt: number,
): WarmupFlowLifecycle {
  let next = applySession(lifecycle, session)
  if (
    next.phase !== 'suspended' ||
    !next.reasons.includes('staleSignal') ||
    session.classifier.signalQuality !== 'usable' ||
    session.classifier.stableClassification === null
  ) {
    return next
  }
  const runId = next.resumeTarget.runId
  next = appReducer(next, {
    type: 'suspensionCleared',
    runId,
    reason: 'staleSignal',
  })
  if (
    next.phase === 'suspended' &&
    next.reasons.length === 1 &&
    next.reasons[0] === 'manual'
  ) {
    const warmup = transitionWarmup(
      createWarmupState(occurredAt),
      {
        type: 'classifierUpdated',
        occurrenceTimeMs: occurredAt,
        signalQuality: session.classifier.signalQuality,
        stableClassification: session.classifier.stableClassification,
      },
      tuning.warmup,
      tuning.countdown,
    )
    next = appReducer(next, {
      type: 'warmupRecovered',
      runId,
      warmup: { ...session, warmup },
    })
  }
  return next
}

function statusAnnouncement(status: TelemetrySourceStatus): string {
  if (status.state === 'connected') return 'Heart-rate monitor connected'
  if (status.state === 'connecting') return 'Connecting to heart-rate monitor'
  if (status.state === 'disconnected') return 'Heart-rate monitor disconnected'
  return status.error.message
}

function targetFromDraft(state: WarmupFlowState): {
  readonly range: TargetRange | null
  readonly error: string | null
} {
  const lowerBpm = Number(state.targetDraft.lower)
  const upperBpm = Number(state.targetDraft.upper)
  if (!Number.isInteger(lowerBpm) || !Number.isInteger(upperBpm)) {
    return { range: null, error: 'Enter whole-number BPM values.' }
  }
  if (
    lowerBpm < tuning.targetRange.minimumBpm ||
    upperBpm > tuning.targetRange.maximumBpm
  ) {
    return {
      range: null,
      error: `Use ${tuning.targetRange.minimumBpm}–${tuning.targetRange.maximumBpm} BPM.`,
    }
  }
  if (lowerBpm >= upperBpm) {
    return { range: null, error: 'Lower BPM must be less than upper BPM.' }
  }
  const range = { lowerBpm, upperBpm }
  try {
    validateTargetRange(range, tuning.heartRateClassifier)
    return { range, error: null }
  } catch {
    return {
      range: null,
      error: 'Target range is incompatible with signal margins.',
    }
  }
}

function reduceWarmupFlow(
  state: WarmupFlowState,
  fact: WarmupFlowFact,
): WarmupFlowState {
  if (fact.type === 'resetDiagnostics') return state
  if (
    fact.type === 'timeAdvanced' &&
    fact.runGeneration !== state.runGeneration
  ) {
    return state
  }
  if (fact.type === 'targetDraftChanged') {
    const next = {
      ...state,
      targetDraft: { ...state.targetDraft, [fact.field]: fact.value },
    }
    return { ...next, targetError: targetFromDraft(next).error }
  }
  if (fact.type === 'targetCommitted') {
    const validated = targetFromDraft(state)
    if (validated.range === null)
      return { ...state, targetError: validated.error }
    let lifecycle = state.lifecycle
    const session = liveSession(lifecycle)
    if (session !== null) {
      const invalidated = invalidateSession(
        { ...session, targetRange: validated.range },
        fact.occurredAt,
        'targetRangeChanged',
        'targetRangeChanged',
      )
      lifecycle = applySession(lifecycle, invalidated)
    }
    return {
      ...state,
      lifecycle,
      targetRange: validated.range,
      targetError: null,
      announcement:
        session === null
          ? state.announcement
          : 'Target range changed. Warm-up progress reset.',
    }
  }
  if (fact.type === 'sourceChanged') {
    return {
      ...state,
      telemetryStatus: { state: 'disconnected' },
      latestPreMissionBpm: null,
      announcement: 'Telemetry source changed',
    }
  }
  if (fact.type === 'beginWarmup') {
    if (
      state.lifecycle.phase !== 'preMission' ||
      state.telemetryStatus.state !== 'connected'
    )
      return state
    const runGeneration = state.runGeneration + 1
    const session = createWarmupSession(fact.occurredAt, state.targetRange)
    return {
      ...state,
      runGeneration,
      lifecycle: appReducer(state.lifecycle, {
        type: 'warmupStarted',
        runId: `run-${runGeneration}`,
        warmup: session,
      }),
      announcement: 'Warm-up started. Establishing a stable signal.',
    }
  }
  if (fact.type === 'backToBriefing') {
    const lifecycle = state.lifecycle
    const runId = runIdFor(lifecycle)
    return runId === null
      ? state
      : {
          ...state,
          lifecycle: appReducer(lifecycle, { type: 'runAbandoned', runId }),
          announcement: 'Returned to mission briefing',
        }
  }
  if (fact.type === 'status') {
    let lifecycle = state.lifecycle
    const session = liveSession(lifecycle)
    if (session !== null && fact.status.state !== 'connected') {
      const disconnected =
        fact.status.state === 'disconnected' ||
        (fact.status.state === 'error' &&
          fact.status.error.code === 'device-disconnected')
      const invalidated = invalidateSession(
        session,
        fact.occurredAt,
        disconnected ? 'disconnect' : 'invalidSignal',
        disconnected ? 'disconnect' : 'invalidSignal',
      )
      lifecycle = applySession(lifecycle, invalidated)
      if (disconnected) {
        const runId =
          lifecycle.phase === 'suspended'
            ? lifecycle.resumeTarget.runId
            : lifecycle.phase === 'preMission'
              ? null
              : lifecycle.runId
        if (runId !== null)
          lifecycle = appReducer(lifecycle, {
            type: 'suspended',
            runId,
            reason: 'disconnect',
          })
      }
    } else if (
      session !== null &&
      fact.status.state === 'connected' &&
      lifecycle.phase === 'suspended' &&
      lifecycle.reasons.includes('disconnect')
    ) {
      const runId = lifecycle.resumeTarget.runId
      lifecycle = appReducer(lifecycle, {
        type: 'suspensionCleared',
        runId,
        reason: 'disconnect',
      })
      if (
        lifecycle.phase === 'suspended' &&
        lifecycle.reasons.length === 1 &&
        lifecycle.reasons[0] === 'manual'
      ) {
        lifecycle = appReducer(lifecycle, {
          type: 'warmupRecovered',
          runId,
          warmup: createWarmupSession(fact.occurredAt, state.targetRange),
        })
      }
    }
    return {
      ...state,
      lifecycle,
      telemetryStatus: fact.status,
      announcement: statusAnnouncement(fact.status),
    }
  }
  if (fact.type === 'sample') {
    const { bpm, occurrenceTimeMs } = fact.sample
    const valid =
      isValidHeartRateBpm(bpm) &&
      bpm >= tuning.heartRateClassifier.plausibleBpm.minimum &&
      bpm <= tuning.heartRateClassifier.plausibleBpm.maximum
    const session = liveSession(state.lifecycle)
    if (session === null)
      return valid ? { ...state, latestPreMissionBpm: bpm } : state
    const nextSession = transitionSession(session, {
      type: 'sample',
      occurrenceTimeMs,
      bpm,
    })
    return {
      ...state,
      lifecycle: recoverFromStaleSignal(
        state.lifecycle,
        nextSession,
        occurrenceTimeMs,
      ),
      announcement:
        nextSession.classifier.signalQuality === 'invalid'
          ? 'Heart-rate signal is invalid. Warm-up progress reset.'
          : state.announcement,
    }
  }
  if (fact.type === 'visibility') {
    const session = liveSession(state.lifecycle)
    if (session === null) return state
    let lifecycle = state.lifecycle
    const runId =
      lifecycle.phase === 'suspended'
        ? lifecycle.resumeTarget.runId
        : lifecycle.phase === 'preMission'
          ? null
          : lifecycle.runId
    if (runId === null) return state
    if (fact.state === 'hidden') {
      lifecycle = applySession(
        lifecycle,
        invalidateSession(session, fact.occurredAt, 'hidden', 'hidden'),
      )
      lifecycle = appReducer(lifecycle, {
        type: 'suspended',
        runId,
        reason: 'hidden',
      })
    } else if (
      lifecycle.phase === 'suspended' &&
      lifecycle.reasons.includes('hidden')
    ) {
      lifecycle = appReducer(lifecycle, {
        type: 'suspensionCleared',
        runId,
        reason: 'hidden',
      })
      if (
        lifecycle.phase === 'suspended' &&
        lifecycle.reasons.length === 1 &&
        lifecycle.reasons[0] === 'manual'
      )
        lifecycle = appReducer(lifecycle, {
          type: 'warmupRecovered',
          runId,
          warmup: createWarmupSession(fact.occurredAt, state.targetRange),
        })
    }
    return {
      ...state,
      lifecycle,
      announcement:
        fact.state === 'hidden'
          ? 'Warm-up reset because the page was hidden'
          : 'Page visible. Restart warm-up when ready.',
    }
  }
  const session = liveSession(state.lifecycle)
  if (session === null) return state
  const nextSession = transitionSession(session, {
    type: 'timeAdvanced',
    occurrenceTimeMs: fact.occurredAt,
  })
  let lifecycle = applySession(state.lifecycle, nextSession)
  const becameStale =
    nextSession.classifier.signalQuality === 'stale' &&
    session.classifier.signalQuality !== 'stale'
  if (becameStale && lifecycle.phase !== 'activeMission') {
    const runId = runIdFor(lifecycle)
    if (runId !== null) {
      lifecycle = appReducer(lifecycle, {
        type: 'suspended',
        runId,
        reason: 'staleSignal',
      })
    }
  }
  return {
    ...state,
    lifecycle,
    announcement: becameStale
      ? 'Heart-rate signal is stale. Warm-up progress reset.'
      : state.announcement,
  }
}

const DIAGNOSTIC_LOG_LIMIT = 1_000

function diagnosticOccurrenceTime(fact: WarmupFlowFact): number {
  return fact.type === 'sample' ? fact.sample.occurrenceTimeMs : fact.occurredAt
}

function diagnosticState(state: WarmupFlowState): {
  readonly lifecycle: string
  readonly transportStatus: string
  readonly signalQuality: string
  readonly stableClassification: RangeClassification | null
  readonly invalidationReason: ClassifierInvalidationReason | null
  readonly warmupStage: string | null
  readonly warmupProgressMs: number
} {
  const session = liveSession(state.lifecycle)
  return {
    lifecycle: state.lifecycle.phase,
    transportStatus: state.telemetryStatus.state,
    signalQuality: session?.classifier.signalQuality ?? 'unavailable',
    stableClassification: session?.classifier.stableClassification ?? null,
    invalidationReason: session?.classifier.lastInvalidationReason ?? null,
    warmupStage: session?.warmup.phase ?? null,
    warmupProgressMs:
      session === null
        ? 0
        : getWarmupProgressMs(session.warmup, tuning.warmup.qualificationMs),
  }
}

interface PendingDiagnosticEvent {
  readonly category: string
  readonly details?: Record<string, unknown>
}

function diagnosticEvents(
  before: WarmupFlowState,
  fact: WarmupFlowFact,
  after: WarmupFlowState,
  ignoredOutOfOrder: boolean,
): readonly PendingDiagnosticEvent[] {
  const beforeState = diagnosticState(before)
  const afterState = diagnosticState(after)
  const events: PendingDiagnosticEvent[] = []

  if (ignoredOutOfOrder) {
    return [
      {
        category: 'ignoredOutOfOrderFact',
        details: {
          factType: fact.type,
          sequence: fact.sequence,
          occurrenceTimeMs: diagnosticOccurrenceTime(fact),
          lastAppliedSequence: before.lastAppliedSequence,
          lastAppliedOccurrenceTimeMs: before.lastAppliedOccurrenceTimeMs,
        },
      },
    ]
  }

  if (fact.type === 'status') {
    events.push({
      category:
        fact.status.state === 'error' ? 'error' : 'connectionStatusChanged',
      details:
        fact.status.state === 'error'
          ? { safeCategory: fact.status.error.code }
          : { status: fact.status.state },
    })
  } else if (fact.type === 'sample') {
    const accepted =
      isValidHeartRateBpm(fact.sample.bpm) &&
      fact.sample.bpm >= tuning.heartRateClassifier.plausibleBpm.minimum &&
      fact.sample.bpm <= tuning.heartRateClassifier.plausibleBpm.maximum
    events.push({
      category: accepted ? 'sampleReceived' : 'sampleRejected',
      details: {
        bpm: fact.sample.bpm,
        sourceType: fact.sample.source.type,
        rrIntervalCount: fact.sample.rrIntervalsMs?.length ?? 0,
        ...(accepted ? {} : { reason: 'invalid-or-implausible-bpm' }),
      },
    })
  } else if (fact.type === 'visibility') {
    events.push({
      category: 'visibilityChanged',
      details: { state: fact.state },
    })
  } else if (
    fact.type === 'timeAdvanced' &&
    fact.runGeneration !== before.runGeneration
  ) {
    events.push({
      category: 'ignoredStaleGenerationCallback',
      details: {
        callbackGeneration: fact.runGeneration,
        currentGeneration: before.runGeneration,
      },
    })
  }

  if (beforeState.signalQuality !== afterState.signalQuality) {
    events.push({
      category: 'signalQualityChanged',
      details: {
        from: beforeState.signalQuality,
        to: afterState.signalQuality,
      },
    })
  }
  if (beforeState.stableClassification !== afterState.stableClassification) {
    events.push({
      category: 'classifierTransition',
      details: {
        from: beforeState.stableClassification,
        to: afterState.stableClassification,
      },
    })
  }
  if (
    afterState.invalidationReason !== null &&
    afterState.invalidationReason !== beforeState.invalidationReason
  ) {
    events.push({
      category: 'classifierInvalidated',
      details: { reason: afterState.invalidationReason },
    })
  }
  if (beforeState.warmupProgressMs > 0 && afterState.warmupProgressMs === 0) {
    events.push({ category: 'warmupProgressReset' })
  }
  if (
    beforeState.warmupStage !== 'countdown' &&
    afterState.warmupStage === 'countdown'
  ) {
    events.push({ category: 'warmupQualified' })
    events.push({ category: 'countdownStarted' })
  } else if (
    beforeState.warmupStage === 'countdown' &&
    afterState.warmupStage === 'warming'
  ) {
    events.push({ category: 'countdownCancelled' })
  }
  if (
    before.lifecycle.phase === 'countdown' &&
    after.lifecycle.phase === 'activeMission'
  ) {
    events.push({ category: 'countdownCompleted' })
  }
  if (before.lifecycle.phase !== after.lifecycle.phase) {
    events.push({
      category: 'lifecycleTransition',
      details: { from: before.lifecycle.phase, to: after.lifecycle.phase },
    })
  }
  return events
}

export function warmupFlowReducer(
  state: WarmupFlowState,
  fact: WarmupFlowFact,
): WarmupFlowState {
  const occurrenceTime = diagnosticOccurrenceTime(fact)
  const ignoredOutOfOrder =
    fact.sequence <= state.lastAppliedSequence ||
    (state.lastAppliedOccurrenceTimeMs !== null &&
      occurrenceTime < state.lastAppliedOccurrenceTimeMs)
  if (fact.type === 'resetDiagnostics' && !ignoredOutOfOrder) {
    return {
      ...state,
      diagnosticLog: [],
      diagnosticSessionStartMs: null,
      diagnosticLastOccurrenceMs: null,
      lastAppliedOccurrenceTimeMs: occurrenceTime,
      lastAppliedSequence: fact.sequence,
    }
  }
  const reduced = ignoredOutOfOrder ? state : reduceWarmupFlow(state, fact)
  const next = ignoredOutOfOrder
    ? reduced
    : {
        ...reduced,
        lastAppliedOccurrenceTimeMs: occurrenceTime,
        lastAppliedSequence: fact.sequence,
      }
  if (!state.diagnosticsEnabled) return next
  const pendingEvents = diagnosticEvents(state, fact, next, ignoredOutOfOrder)
  if (pendingEvents.length === 0) return next
  const sessionStart = state.diagnosticSessionStartMs ?? occurrenceTime
  const loggedOccurrenceTime = Math.max(
    occurrenceTime,
    state.diagnosticLastOccurrenceMs ?? occurrenceTime,
  )
  const firstSequence =
    (state.diagnosticLog[state.diagnosticLog.length - 1]?.sequence ?? 0) + 1
  const afterState = diagnosticState(next)
  const entries = pendingEvents.map(
    ({ category, details = {} }, index): WarmupTelemetryDiagnosticEntry => ({
      sequence: firstSequence + index,
      occurrenceTimeMs: Math.max(0, loggedOccurrenceTime - sessionStart),
      category,
      details,
      lifecycleBefore: state.lifecycle.phase,
      lifecycleAfter: next.lifecycle.phase,
      transportStatus: afterState.transportStatus,
      signalQuality: afterState.signalQuality,
      stableClassification: afterState.stableClassification,
    }),
  )
  return {
    ...next,
    diagnosticSessionStartMs: sessionStart,
    diagnosticLastOccurrenceMs: loggedOccurrenceTime,
    diagnosticLog: [...state.diagnosticLog, ...entries].slice(
      -DIAGNOSTIC_LOG_LIMIT,
    ),
  }
}

export function canBeginWarmup(state: WarmupFlowState): boolean {
  return (
    state.lifecycle.phase === 'preMission' &&
    state.telemetryStatus.state === 'connected' &&
    state.targetError === null
  )
}
