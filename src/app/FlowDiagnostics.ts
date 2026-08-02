import type {
  ClassifierInvalidationReason,
  RangeClassification,
} from '../domain/heart-rate/classifier'
import { isValidHeartRateBpm } from '../domain/heart-rate/range'
import { getWarmupProgressMs } from '../domain/mission/warmup'
import type { MissionFlowFact, MissionFlowState } from './MissionFlowController'
import type { MissionRun } from './MissionRun'
import type { WarmupSession } from './WarmupSession'

export interface FlowDiagnosticEntry {
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

export interface FlowDiagnosticState {
  readonly lifecycle: string
  readonly transportStatus: string
  readonly signalQuality: string
  readonly stableClassification: RangeClassification | null
  readonly invalidationReason: ClassifierInvalidationReason | null
  readonly warmupStage: string | null
  readonly warmupProgressMs: number
  readonly suspensionReasons: readonly string[]
}

export interface FlowDiagnosticPatch {
  readonly diagnosticLog: readonly FlowDiagnosticEntry[]
  readonly diagnosticSessionStartMs: number
  readonly diagnosticLastOccurrenceMs: number
}

export interface FlowDiagnosticTuning {
  readonly plausibleBpm: {
    readonly minimum: number
    readonly maximum: number
  }
  readonly warmupQualificationMs: number
}

interface PendingDiagnosticEvent {
  readonly category: string
  readonly details?: Record<string, unknown>
}

function sameTelemetryStatus(
  left: MissionFlowState['telemetryStatus'],
  right: MissionFlowState['telemetryStatus'],
): boolean {
  if (left.state !== right.state) return false
  if (left.state !== 'error' || right.state !== 'error') return true
  return (
    left.error.code === right.error.code &&
    left.error.message === right.error.message
  )
}

export function getWarmupDiagnosticSession(
  state: MissionFlowState,
): WarmupSession | null {
  const { lifecycle } = state
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

function liveRun(state: MissionFlowState): MissionRun | null {
  const { lifecycle } = state
  if (lifecycle.phase === 'activeMission') return lifecycle.mission
  if (
    lifecycle.phase === 'suspended' &&
    lifecycle.resumeTarget.phase === 'activeMission'
  ) {
    return lifecycle.resumeTarget.mission
  }
  return null
}

export function getFlowDiagnosticState(
  state: MissionFlowState,
  tuning: FlowDiagnosticTuning,
): FlowDiagnosticState {
  const session = getWarmupDiagnosticSession(state)
  const run = liveRun(state)
  return {
    lifecycle: state.lifecycle.phase,
    transportStatus: state.telemetryStatus.state,
    signalQuality:
      session?.classifier.signalQuality ??
      run?.classifier.signalQuality ??
      'unavailable',
    stableClassification:
      session?.classifier.stableClassification ??
      run?.classifier.stableClassification ??
      null,
    invalidationReason:
      session?.classifier.lastInvalidationReason ??
      run?.classifier.lastInvalidationReason ??
      null,
    warmupStage: session?.warmup.phase ?? null,
    warmupProgressMs:
      session === null
        ? 0
        : getWarmupProgressMs(session.warmup, tuning.warmupQualificationMs),
    suspensionReasons:
      state.lifecycle.phase === 'suspended' ? state.lifecycle.reasons : [],
  }
}

function getDiagnosticEvents({
  before,
  fact,
  after,
  occurrenceTime,
  ignoredOutOfOrder,
  tuning,
}: {
  readonly before: MissionFlowState
  readonly fact: MissionFlowFact
  readonly after: MissionFlowState
  readonly occurrenceTime: number
  readonly ignoredOutOfOrder: boolean
  readonly tuning: FlowDiagnosticTuning
}): readonly PendingDiagnosticEvent[] {
  const beforeState = getFlowDiagnosticState(before, tuning)
  const afterState = getFlowDiagnosticState(after, tuning)
  const events: PendingDiagnosticEvent[] = []

  if (ignoredOutOfOrder) {
    return [
      {
        category: 'ignoredOutOfOrderFact',
        details: {
          factType: fact.type,
          sequence: fact.sequence,
          occurrenceTimeMs: occurrenceTime,
          lastAppliedSequence: before.lastAppliedSequence,
          lastAppliedOccurrenceTimeMs: before.lastAppliedOccurrenceTimeMs,
        },
      },
    ]
  }

  const staleSourceCallback =
    (fact.type === 'status' || fact.type === 'sample') &&
    fact.sourceGeneration !== undefined &&
    fact.sourceGeneration !== before.telemetrySourceGeneration
  if (staleSourceCallback) {
    events.push({
      category: 'ignoredStaleSourceCallback',
      details: {
        callbackGeneration: fact.sourceGeneration,
        currentGeneration: before.telemetrySourceGeneration,
      },
    })
  } else if (
    fact.type === 'status' &&
    !sameTelemetryStatus(before.telemetryStatus, after.telemetryStatus)
  ) {
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
      fact.sample.bpm >= tuning.plausibleBpm.minimum &&
      fact.sample.bpm <= tuning.plausibleBpm.maximum
    events.push({
      category: accepted ? 'sampleReceived' : 'sampleRejected',
      details: {
        bpm: fact.sample.bpm,
        sourceType: fact.sample.source.type,
        rrIntervalCount: fact.sample.rrIntervalsMs?.length ?? 0,
        ...(accepted ? {} : { reason: 'invalid-or-implausible-bpm' }),
      },
    })
  } else if (
    fact.type === 'visibility' &&
    before.pageVisibility !== after.pageVisibility
  ) {
    events.push({
      category: 'visibilityChanged',
      details: { state: fact.state },
    })
  } else if (
    'runGeneration' in fact &&
    fact.runGeneration !== before.runGeneration
  ) {
    events.push({
      category:
        fact.type === 'timeAdvanced'
          ? 'ignoredStaleGenerationCallback'
          : 'ignoredStaleRunIntent',
      details: {
        factType: fact.type,
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
  if (
    before.lifecycle.phase !== 'result' &&
    after.lifecycle.phase === 'result'
  ) {
    events.push({
      category: 'resultEntered',
      details: { outcome: after.lifecycle.result.outcome },
    })
  }
  if (
    fact.type === 'runAgain' &&
    before.lifecycle.phase === 'result' &&
    after.lifecycle.phase === 'preMission'
  ) {
    events.push({ category: 'runAgainAccepted' })
    events.push({
      category: 'runGenerationEstablished',
      details: {
        previousGeneration: before.runGeneration,
        currentGeneration: after.runGeneration,
      },
    })
  }
  if (before.lifecycle.phase !== after.lifecycle.phase) {
    events.push({
      category: 'lifecycleTransition',
      details: { from: before.lifecycle.phase, to: after.lifecycle.phase },
    })
  }
  const addedReasons = afterState.suspensionReasons.filter(
    (reason) => !beforeState.suspensionReasons.includes(reason),
  )
  const removedReasons = beforeState.suspensionReasons.filter(
    (reason) => !afterState.suspensionReasons.includes(reason),
  )
  if (addedReasons.length > 0 || removedReasons.length > 0) {
    events.push({
      category: 'interruptionChanged',
      details: { addedReasons, removedReasons },
    })
  }
  return events
}

export function appendFlowDiagnostics({
  before,
  fact,
  after,
  occurrenceTime,
  ignoredOutOfOrder,
  tuning,
  limit,
}: {
  readonly before: MissionFlowState
  readonly fact: MissionFlowFact
  readonly after: MissionFlowState
  readonly occurrenceTime: number
  readonly ignoredOutOfOrder: boolean
  readonly tuning: FlowDiagnosticTuning
  readonly limit: number
}): FlowDiagnosticPatch | null {
  const pendingEvents = getDiagnosticEvents({
    before,
    fact,
    after,
    occurrenceTime,
    ignoredOutOfOrder,
    tuning,
  })
  if (pendingEvents.length === 0) return null

  const sessionStart = before.diagnosticSessionStartMs ?? occurrenceTime
  const loggedOccurrenceTime = Math.max(
    occurrenceTime,
    before.diagnosticLastOccurrenceMs ?? occurrenceTime,
  )
  const firstSequence =
    (before.diagnosticLog[before.diagnosticLog.length - 1]?.sequence ?? 0) + 1
  const afterState = getFlowDiagnosticState(after, tuning)
  const entries = pendingEvents.map(
    ({ category, details = {} }, index): FlowDiagnosticEntry => ({
      sequence: firstSequence + index,
      occurrenceTimeMs: Math.max(0, loggedOccurrenceTime - sessionStart),
      category,
      details,
      lifecycleBefore: before.lifecycle.phase,
      lifecycleAfter: after.lifecycle.phase,
      transportStatus: afterState.transportStatus,
      signalQuality: afterState.signalQuality,
      stableClassification: afterState.stableClassification,
    }),
  )
  return {
    diagnosticSessionStartMs: sessionStart,
    diagnosticLastOccurrenceMs: loggedOccurrenceTime,
    diagnosticLog: [...before.diagnosticLog, ...entries].slice(-limit),
  }
}
