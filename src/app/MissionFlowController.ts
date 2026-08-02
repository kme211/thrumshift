import { defaultGameplayTuning } from '../config/gameplayTuning'
import {
  transitionClassifier,
  validateTargetRange,
} from '../domain/heart-rate/classifier'
import type {
  ClassifierTransition,
  TargetRange,
} from '../domain/heart-rate/classifier'
import { isValidHeartRateBpm } from '../domain/heart-rate/range'
import type {
  HeartRateSample,
  HeartRateSourceIdentity,
} from '../domain/heart-rate/types'
import { advanceMissionSession } from '../domain/mission/missionSession'
import type { MissionSessionFact } from '../domain/mission/missionStatistics'
import {
  isPuzzleComplete,
  resetPuzzle,
  rotateTile,
  selectPuzzleHint,
} from '../domain/puzzle/model'
import { createWarmupState, transitionWarmup } from '../domain/mission/warmup'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'
import type { AppState } from './AppState'
import { appReducer } from './appReducer'
import type { MissionResult } from '../domain/mission/MissionResult'
import { createMissionRun } from './MissionRun'
import type { MissionRun } from './MissionRun'
import { appendFlowDiagnostics } from './FlowDiagnostics'
import type { FlowDiagnosticEntry } from './FlowDiagnostics'
import {
  announcementForActiveRunTransition,
  announcementForInterruption,
  announcementForTelemetryStatus,
} from './FlowAnnouncements'
import {
  advanceWarmupSession,
  createWarmupSession,
  invalidateWarmupSession,
} from './WarmupSession'
import type { WarmupSession } from './WarmupSession'

export type { FlowDiagnosticEntry } from './FlowDiagnostics'

export type MissionFlowLifecycle = AppState<
  WarmupSession,
  MissionRun,
  MissionResult
>

export interface MissionFlowState {
  readonly lifecycle: MissionFlowLifecycle
  readonly targetRange: TargetRange
  readonly targetDraft: { readonly lower: string; readonly upper: string }
  readonly targetError: string | null
  readonly telemetryStatus: TelemetrySourceStatus
  readonly telemetrySourceIdentity: HeartRateSourceIdentity | null
  readonly telemetrySourceGeneration: number
  readonly pageVisibility: 'visible' | 'hidden'
  readonly latestPreMissionBpm: number | null
  readonly announcement: string
  readonly runGeneration: number
  readonly diagnosticsEnabled: boolean
  readonly diagnosticLog: readonly FlowDiagnosticEntry[]
  readonly diagnosticSessionStartMs: number | null
  readonly diagnosticLastOccurrenceMs: number | null
  readonly lastAppliedOccurrenceTimeMs: number | null
  readonly lastAppliedSequence: number
}

export type MissionFlowFactPayload =
  | {
      readonly type: 'status'
      readonly occurredAt: number
      readonly status: TelemetrySourceStatus
      readonly source?: HeartRateSourceIdentity
      readonly sourceGeneration?: number
    }
  | {
      readonly type: 'sample'
      readonly sample: HeartRateSample
      readonly sourceGeneration?: number
    }
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
  | {
      readonly type: 'sourceChanged'
      readonly occurredAt: number
      readonly source?: HeartRateSourceIdentity
      readonly sourceGeneration?: number
    }
  | { readonly type: 'backToBriefing'; readonly occurredAt: number }
  | {
      readonly type: 'puzzleTileRotated'
      readonly occurredAt: number
      readonly tileId: string
    }
  | { readonly type: 'puzzleHintRequested'; readonly occurredAt: number }
  | { readonly type: 'puzzleReset'; readonly occurredAt: number }
  | { readonly type: 'manualPause'; readonly occurredAt: number }
  | { readonly type: 'manualResume'; readonly occurredAt: number }
  | { readonly type: 'resetDiagnostics'; readonly occurredAt: number }

export type MissionFlowFact = MissionFlowFactPayload & {
  readonly sequence: number
}

const tuning = defaultGameplayTuning
const announcementTuning = {
  stabilityMinimum: tuning.stability.minimum,
  stabilityMaximum: tuning.stability.maximum,
}

export function createMissionFlowState(
  diagnosticsEnabled = false,
): MissionFlowState {
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
    telemetrySourceIdentity: null,
    telemetrySourceGeneration: 0,
    pageVisibility: 'visible',
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

function liveSession(lifecycle: MissionFlowLifecycle): WarmupSession | null {
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
  lifecycle: MissionFlowLifecycle,
  session: WarmupSession,
  sequence = 0,
): MissionFlowLifecycle {
  const runId =
    lifecycle.phase === 'suspended'
      ? lifecycle.resumeTarget.runId
      : lifecycle.phase === 'preMission'
        ? null
        : lifecycle.runId
  if (runId === null) return lifecycle
  if (session.warmup.phase === 'complete' && lifecycle.phase === 'countdown') {
    let run = createMissionRun(
      session.warmup.lastProcessedTimeMs,
      session.targetRange,
      session.classifier,
      tuning,
    )
    run = {
      ...run,
      session: advanceMissionSession(
        run.session,
        {
          type: 'classifierUpdated',
          occurrenceTimeMs: session.warmup.lastProcessedTimeMs,
          sequence: sequence * 10 + 1,
          signalQuality: session.classifier.signalQuality,
          stableClassification: session.classifier.stableClassification,
        },
        tuning,
      ),
    }
    return appReducer(lifecycle, {
      type: 'missionStarted',
      runId,
      mission: run,
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

function liveRun(lifecycle: MissionFlowLifecycle): MissionRun | null {
  if (lifecycle.phase === 'activeMission') return lifecycle.mission
  if (
    lifecycle.phase === 'suspended' &&
    lifecycle.resumeTarget.phase === 'activeMission'
  ) {
    return lifecycle.resumeTarget.mission
  }
  return null
}

function updateRunLifecycle(
  lifecycle: MissionFlowLifecycle,
  run: MissionRun,
): MissionFlowLifecycle {
  const runId = runIdFor(lifecycle)
  if (runId === null) return lifecycle
  let next = appReducer(lifecycle, {
    type: 'missionUpdated',
    runId,
    mission: run,
  })
  if (run.session.result !== null) {
    next = appReducer(next, {
      type: 'runEnded',
      runId,
      result: run.session.result,
    })
  }
  return next
}

function advanceRun(run: MissionRun, fact: MissionSessionFact): MissionRun {
  return { ...run, session: advanceMissionSession(run.session, fact, tuning) }
}

function advanceSuspendedRun(
  run: MissionRun,
  occurredAt: number,
  sequence: number,
): MissionRun {
  return run.session.mission.lastProcessedTimeMs >= occurredAt
    ? run
    : advanceRun(run, {
        type: 'timeAdvanced',
        occurrenceTimeMs: occurredAt,
        sequence: subSequence(sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
      })
}

const DERIVED_SIGNAL_SEQUENCE_OFFSET = 1
const STALE_SUSPENSION_SEQUENCE_OFFSET = 5
const PAUSE_INVALIDATION_SEQUENCE_OFFSET = 6
const EXTERNAL_FACT_SEQUENCE_OFFSET = 8
const PUZZLE_COMPLETION_SEQUENCE_OFFSET = 9

function subSequence(sequence: number, offset: number): number {
  return sequence * 10 + offset
}

function projectClassifierTransition(
  run: MissionRun,
  transition: ClassifierTransition,
  sequence: number,
  firstOffset: number,
): MissionRun {
  if (transition.projections.length + firstOffset > 10) {
    throw new Error('Classifier projections exceeded the fact sub-sequence')
  }
  let projected = { ...run, classifier: transition.state }
  for (const [index, projection] of transition.projections.entries()) {
    projected = advanceRun(projected, {
      type: 'classifierUpdated',
      occurrenceTimeMs: projection.occurrenceTimeMs,
      sequence: subSequence(sequence, firstOffset + index),
      signalQuality: projection.signalQuality,
      stableClassification: projection.stableClassification,
    })
  }
  return projected
}

/**
 * Signal authority always precedes the external fact at the same occurrence
 * time. Derived classifier deadlines use offsets 1–5, pause invalidation uses
 * 6, and the external fact uses 8. Puzzle completion follows rotation at 9.
 */
interface ActiveSignalAuthority {
  readonly run: MissionRun
  readonly staleAt: number | null
}

function advanceActiveRunSignalAuthority(
  run: MissionRun,
  occurredAt: number,
  sequence: number,
): ActiveSignalAuthority {
  const transition = transitionClassifier(
    run.classifier,
    { type: 'timeAdvanced', occurrenceTimeMs: occurredAt },
    run.session.targetRange,
    tuning.heartRateClassifier,
  )
  let projected = projectClassifierTransition(
    run,
    transition,
    sequence,
    DERIVED_SIGNAL_SEQUENCE_OFFSET,
  )
  const staleAt =
    transition.projections.find(
      (projection) => projection.signalQuality === 'stale',
    )?.occurrenceTimeMs ?? null
  if (staleAt !== null && projected.session.result === null) {
    projected = advanceRun(projected, {
      type: 'lifecycleProjectionChanged',
      occurrenceTimeMs: staleAt,
      sequence: subSequence(sequence, STALE_SUSPENSION_SEQUENCE_OFFSET),
      suspended: true,
      disconnected: projected.session.statistics.disconnected,
    })
  }
  return { run: projected, staleAt }
}

function runIdFor(lifecycle: MissionFlowLifecycle): string | null {
  return lifecycle.phase === 'preMission'
    ? null
    : lifecycle.phase === 'suspended'
      ? lifecycle.resumeTarget.runId
      : lifecycle.runId
}

function addSuspensionReason(
  lifecycle: MissionFlowLifecycle,
  reason: 'manual' | 'resumeRequired' | 'hidden' | 'disconnect' | 'staleSignal',
): MissionFlowLifecycle {
  const runId = runIdFor(lifecycle)
  if (runId === null) return lifecycle
  return appReducer(lifecycle, { type: 'suspended', runId, reason })
}

function applyStaleReason(
  lifecycle: MissionFlowLifecycle,
  staleAt: number | null,
): MissionFlowLifecycle {
  return staleAt === null
    ? lifecycle
    : addSuspensionReason(lifecycle, 'staleSignal')
}

function isDisconnectedStatus(status: TelemetrySourceStatus): boolean {
  return (
    status.state === 'disconnected' ||
    (status.state === 'error' && status.error.code === 'device-disconnected')
  )
}

export function canResumeMission(state: MissionFlowState): boolean {
  const run = liveRun(state.lifecycle)
  return (
    run !== null &&
    state.lifecycle.phase === 'suspended' &&
    state.lifecycle.resumeTarget.phase === 'activeMission' &&
    state.lifecycle.reasons.length === 1 &&
    (state.lifecycle.reasons[0] === 'manual' ||
      state.lifecycle.reasons[0] === 'resumeRequired') &&
    state.pageVisibility === 'visible' &&
    state.telemetryStatus.state === 'connected' &&
    run.classifier.signalQuality === 'usable' &&
    run.classifier.stableClassification !== null &&
    run.session.result === null
  )
}

function recoverFromStaleSignal(
  lifecycle: MissionFlowLifecycle,
  session: WarmupSession,
  occurredAt: number,
): MissionFlowLifecycle {
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
    next.reasons[0] === 'resumeRequired'
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

function targetFromDraft(state: MissionFlowState): {
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

type FactOf<Type extends MissionFlowFact['type']> = Extract<
  MissionFlowFact,
  { readonly type: Type }
>

function handleTargetDraftChange(
  state: MissionFlowState,
  fact: FactOf<'targetDraftChanged'>,
): MissionFlowState {
  const next = {
    ...state,
    targetDraft: { ...state.targetDraft, [fact.field]: fact.value },
  }
  return { ...next, targetError: targetFromDraft(next).error }
}

function handleTargetCommit(
  state: MissionFlowState,
  fact: FactOf<'targetCommitted'>,
): MissionFlowState {
  const validated = targetFromDraft(state)
  if (validated.range === null) {
    return { ...state, targetError: validated.error }
  }
  let lifecycle = state.lifecycle
  const session = liveSession(lifecycle)
  if (session !== null) {
    const invalidated = invalidateWarmupSession(
      { ...session, targetRange: validated.range },
      fact.occurredAt,
      'targetRangeChanged',
      'targetRangeChanged',
      tuning,
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

function handleSourceChange(
  state: MissionFlowState,
  fact: FactOf<'sourceChanged'>,
): MissionFlowState {
  return {
    ...state,
    telemetryStatus: { state: 'disconnected' },
    telemetrySourceIdentity: fact.source ?? state.telemetrySourceIdentity,
    telemetrySourceGeneration:
      fact.sourceGeneration ?? state.telemetrySourceGeneration,
    latestPreMissionBpm: null,
    announcement: 'Telemetry source changed',
  }
}

function handleWarmupStart(
  state: MissionFlowState,
  fact: FactOf<'beginWarmup'>,
): MissionFlowState {
  if (
    state.lifecycle.phase !== 'preMission' ||
    state.telemetryStatus.state !== 'connected'
  ) {
    return state
  }
  const runGeneration = state.runGeneration + 1
  const session = createWarmupSession(
    fact.occurredAt,
    state.targetRange,
    tuning,
  )
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

function handleBackToBriefing(state: MissionFlowState): MissionFlowState {
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

function handleManualPause(
  state: MissionFlowState,
  fact: FactOf<'manualPause'>,
): MissionFlowState {
  const run = liveRun(state.lifecycle)
  if (run === null || state.lifecycle.phase !== 'activeMission') return state
  const runId = state.lifecycle.runId
  const authority = advanceActiveRunSignalAuthority(
    run,
    fact.occurredAt,
    fact.sequence,
  )
  let advanced = authority.run
  if (advanced.session.result !== null) {
    return {
      ...state,
      lifecycle: updateRunLifecycle(state.lifecycle, advanced),
      announcement: announcementForActiveRunTransition(
        run,
        advanced,
        state.announcement,
        announcementTuning,
      ),
    }
  }
  const invalidated = transitionClassifier(
    advanced.classifier,
    {
      type: 'invalidate',
      occurrenceTimeMs: fact.occurredAt,
      reason: 'manualSuspension',
    },
    advanced.session.targetRange,
    tuning.heartRateClassifier,
  )
  advanced = projectClassifierTransition(
    advanced,
    invalidated,
    fact.sequence,
    PAUSE_INVALIDATION_SEQUENCE_OFFSET,
  )
  advanced = advanceRun(advanced, {
    type: 'lifecycleProjectionChanged',
    occurrenceTimeMs: fact.occurredAt,
    sequence: subSequence(fact.sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
    suspended: true,
    disconnected: false,
  })
  let lifecycle = applyStaleReason(
    updateRunLifecycle(state.lifecycle, advanced),
    authority.staleAt,
  )
  if (lifecycle.phase === 'activeMission') {
    lifecycle = appReducer(lifecycle, {
      type: 'suspended',
      runId,
      reason: 'manual',
    })
  } else if (lifecycle.phase === 'suspended') {
    lifecycle = addSuspensionReason(lifecycle, 'manual')
  }
  return {
    ...state,
    lifecycle,
    announcement: announcementForInterruption(
      ['manualPaused'],
      state.announcement,
    ),
  }
}

function handleManualResume(
  state: MissionFlowState,
  fact: FactOf<'manualResume'>,
): MissionFlowState {
  const run = liveRun(state.lifecycle)
  if (run === null || state.lifecycle.phase !== 'suspended') return state
  const runId = state.lifecycle.resumeTarget.runId
  const authority = advanceActiveRunSignalAuthority(
    run,
    fact.occurredAt,
    fact.sequence,
  )
  let lifecycle = applyStaleReason(
    updateRunLifecycle(state.lifecycle, authority.run),
    authority.staleAt,
  )
  const current = { ...state, lifecycle }
  if (!canResumeMission(current)) {
    return authority.staleAt === null
      ? current
      : {
          ...current,
          announcement: announcementForInterruption(
            ['signalStale'],
            state.announcement,
          ),
        }
  }
  let advanced = liveRun(lifecycle)
  if (advanced === null) return current
  advanced = advanceRun(advanced, {
    type: 'lifecycleProjectionChanged',
    occurrenceTimeMs: fact.occurredAt,
    sequence: subSequence(fact.sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
    suspended: false,
    disconnected: false,
  })
  lifecycle = updateRunLifecycle(lifecycle, advanced)
  if (lifecycle.phase === 'suspended') {
    lifecycle = appReducer(lifecycle, { type: 'resumed', runId })
  }
  return {
    ...state,
    lifecycle,
    announcement: announcementForInterruption(['resumed'], state.announcement),
  }
}

function handlePuzzleRotation(
  state: MissionFlowState,
  fact: FactOf<'puzzleTileRotated'>,
): MissionFlowState {
  const run = liveRun(state.lifecycle)
  if (run === null || state.lifecycle.phase !== 'activeMission') return state
  const authority = advanceActiveRunSignalAuthority(
    run,
    fact.occurredAt,
    fact.sequence,
  )
  let advanced = authority.run
  if (advanced.session.result !== null) {
    return {
      ...state,
      lifecycle: updateRunLifecycle(state.lifecycle, advanced),
      announcement: announcementForActiveRunTransition(
        run,
        advanced,
        state.announcement,
        announcementTuning,
      ),
    }
  }
  if (authority.staleAt !== null) {
    advanced = advanceSuspendedRun(advanced, fact.occurredAt, fact.sequence)
    return {
      ...state,
      lifecycle: applyStaleReason(
        updateRunLifecycle(state.lifecycle, advanced),
        authority.staleAt,
      ),
      announcement: announcementForInterruption(
        ['signalStale'],
        state.announcement,
      ),
    }
  }
  advanced = advanceRun(advanced, {
    type: 'puzzleTileRotated',
    occurrenceTimeMs: fact.occurredAt,
    sequence: subSequence(fact.sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
  })
  if (advanced.session.result !== null) {
    return {
      ...state,
      lifecycle: updateRunLifecycle(state.lifecycle, advanced),
      announcement: announcementForActiveRunTransition(
        run,
        advanced,
        state.announcement,
        announcementTuning,
      ),
    }
  }
  const puzzle = rotateTile(advanced.puzzle, fact.tileId)
  if (puzzle === advanced.puzzle) return state
  advanced = {
    ...advanced,
    puzzle,
    hint: null,
    puzzleRotationCounts: {
      ...advanced.puzzleRotationCounts,
      [fact.tileId]: (advanced.puzzleRotationCounts[fact.tileId] ?? 0) + 1,
    },
  }
  if (isPuzzleComplete(puzzle)) {
    advanced = advanceRun(advanced, {
      type: 'puzzleCompleted',
      occurrenceTimeMs: fact.occurredAt,
      sequence: subSequence(fact.sequence, PUZZLE_COMPLETION_SEQUENCE_OFFSET),
    })
  }
  return {
    ...state,
    lifecycle: updateRunLifecycle(state.lifecycle, advanced),
    announcement: isPuzzleComplete(puzzle)
      ? 'Coolant route complete. Reactor flow restored.'
      : state.announcement,
  }
}

function handlePuzzleHintRequest(
  state: MissionFlowState,
  fact: FactOf<'puzzleHintRequested'>,
): MissionFlowState {
  const run = liveRun(state.lifecycle)
  if (run === null || state.lifecycle.phase !== 'activeMission') return state
  const authority = advanceActiveRunSignalAuthority(
    run,
    fact.occurredAt,
    fact.sequence,
  )
  let advanced = authority.run
  if (authority.staleAt !== null) {
    advanced = advanceSuspendedRun(advanced, fact.occurredAt, fact.sequence)
    return {
      ...state,
      lifecycle: applyStaleReason(
        updateRunLifecycle(state.lifecycle, advanced),
        authority.staleAt,
      ),
      announcement: announcementForInterruption(
        ['signalStale'],
        state.announcement,
      ),
    }
  }
  if (
    advanced.session.result !== null ||
    advanced.session.mission.activeElapsedTimeMs < advanced.hintEligibilityMs
  ) {
    return {
      ...state,
      lifecycle: updateRunLifecycle(state.lifecycle, advanced),
    }
  }
  const hint = selectPuzzleHint(advanced.puzzle)
  if (hint === null) return state
  advanced = advanceRun(advanced, {
    type: 'puzzleHintRequested',
    occurrenceTimeMs: fact.occurredAt,
    sequence: subSequence(fact.sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
  })
  if (advanced.session.result === null) {
    advanced = { ...advanced, hint }
  }
  return {
    ...state,
    lifecycle: updateRunLifecycle(state.lifecycle, advanced),
    announcement: state.announcement,
  }
}

function handlePuzzleReset(
  state: MissionFlowState,
  fact: FactOf<'puzzleReset'>,
): MissionFlowState {
  const run = liveRun(state.lifecycle)
  if (run === null || state.lifecycle.phase !== 'activeMission') return state
  const authority = advanceActiveRunSignalAuthority(
    run,
    fact.occurredAt,
    fact.sequence,
  )
  let advanced = authority.run
  if (authority.staleAt !== null) {
    advanced = advanceSuspendedRun(advanced, fact.occurredAt, fact.sequence)
    return {
      ...state,
      lifecycle: applyStaleReason(
        updateRunLifecycle(state.lifecycle, advanced),
        authority.staleAt,
      ),
      announcement: announcementForInterruption(
        ['signalStale'],
        state.announcement,
      ),
    }
  }
  if (advanced.session.result === null) {
    advanced = advanceRun(advanced, {
      type: 'puzzleReset',
      occurrenceTimeMs: fact.occurredAt,
      sequence: subSequence(fact.sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
    })
  }
  if (advanced.session.result === null) {
    advanced = {
      ...advanced,
      puzzle: resetPuzzle(advanced.puzzle),
      hint: null,
      puzzleRotationCounts: {},
    }
  }
  return {
    ...state,
    lifecycle: updateRunLifecycle(state.lifecycle, advanced),
    announcement:
      advanced.session.result === null
        ? state.announcement
        : announcementForActiveRunTransition(
            run,
            advanced,
            state.announcement,
            announcementTuning,
          ),
  }
}

function interruptActiveRun(
  state: MissionFlowState,
  occurredAt: number,
  sequence: number,
  reason: 'hidden' | 'disconnect',
): {
  readonly lifecycle: MissionFlowLifecycle
  readonly finalized: boolean
  readonly staleAt: number | null
} {
  const run = liveRun(state.lifecycle)
  if (run === null) {
    return {
      lifecycle: state.lifecycle,
      finalized: false,
      staleAt: null,
    }
  }
  const authority = advanceActiveRunSignalAuthority(run, occurredAt, sequence)
  let advanced = authority.run
  if (advanced.session.result !== null) {
    return {
      lifecycle: updateRunLifecycle(state.lifecycle, advanced),
      finalized: true,
      staleAt: authority.staleAt,
    }
  }
  const invalidated = transitionClassifier(
    advanced.classifier,
    {
      type: 'invalidate',
      occurrenceTimeMs: occurredAt,
      reason: reason === 'hidden' ? 'hidden' : 'disconnect',
    },
    advanced.session.targetRange,
    tuning.heartRateClassifier,
  )
  advanced = projectClassifierTransition(
    advanced,
    invalidated,
    sequence,
    PAUSE_INVALIDATION_SEQUENCE_OFFSET,
  )
  advanced = advanceRun(advanced, {
    type: 'lifecycleProjectionChanged',
    occurrenceTimeMs: occurredAt,
    sequence: subSequence(sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
    suspended: true,
    disconnected:
      reason === 'disconnect' || advanced.session.statistics.disconnected,
  })
  let lifecycle = applyStaleReason(
    updateRunLifecycle(state.lifecycle, advanced),
    authority.staleAt,
  )
  lifecycle = addSuspensionReason(lifecycle, reason)
  return { lifecycle, finalized: false, staleAt: authority.staleAt }
}

function handleTelemetryStatus(
  state: MissionFlowState,
  fact: FactOf<'status'>,
): MissionFlowState {
  const wasDisconnected = isDisconnectedStatus(state.telemetryStatus)
  const disconnected = isDisconnectedStatus(fact.status)
  const run = liveRun(state.lifecycle)
  if (run !== null) {
    if (disconnected && !wasDisconnected) {
      const interrupted = interruptActiveRun(
        state,
        fact.occurredAt,
        fact.sequence,
        'disconnect',
      )
      return {
        ...state,
        lifecycle: interrupted.lifecycle,
        telemetryStatus: fact.status,
        announcement: interrupted.finalized
          ? announcementForActiveRunTransition(
              run,
              liveRun(interrupted.lifecycle) ?? run,
              state.announcement,
              announcementTuning,
            )
          : announcementForInterruption(['disconnected'], state.announcement),
      }
    }
    if (
      fact.status.state === 'connected' &&
      state.lifecycle.phase === 'suspended' &&
      state.lifecycle.reasons.includes('disconnect')
    ) {
      const authority = advanceActiveRunSignalAuthority(
        run,
        fact.occurredAt,
        fact.sequence,
      )
      let lifecycle = updateRunLifecycle(state.lifecycle, authority.run)
      if (authority.run.session.result === null) {
        let advanced = authority.run
        advanced = advanceRun(advanced, {
          type: 'lifecycleProjectionChanged',
          occurrenceTimeMs: fact.occurredAt,
          sequence: subSequence(fact.sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
          suspended: true,
          disconnected: false,
        })
        lifecycle = applyStaleReason(
          updateRunLifecycle(state.lifecycle, advanced),
          authority.staleAt,
        )
        if (lifecycle.phase === 'suspended') {
          lifecycle = appReducer(lifecycle, {
            type: 'suspensionCleared',
            runId: lifecycle.resumeTarget.runId,
            reason: 'disconnect',
          })
        }
      }
      return {
        ...state,
        lifecycle,
        telemetryStatus: fact.status,
        announcement:
          authority.run.session.result === null
            ? announcementForInterruption(['reconnected'], state.announcement)
            : announcementForActiveRunTransition(
                run,
                authority.run,
                state.announcement,
                announcementTuning,
              ),
      }
    }
    if (
      fact.status.state === state.telemetryStatus.state &&
      disconnected === wasDisconnected
    ) {
      return state
    }
    return {
      ...state,
      telemetryStatus: fact.status,
      announcement: announcementForTelemetryStatus(fact.status),
    }
  }
  let lifecycle = state.lifecycle
  const session = liveSession(lifecycle)
  if (session !== null && fact.status.state !== 'connected') {
    const invalidated = invalidateWarmupSession(
      session,
      fact.occurredAt,
      disconnected ? 'disconnect' : 'invalidSignal',
      disconnected ? 'disconnect' : 'invalidSignal',
      tuning,
    )
    lifecycle = applySession(lifecycle, invalidated)
    if (disconnected) {
      const runId =
        lifecycle.phase === 'suspended'
          ? lifecycle.resumeTarget.runId
          : lifecycle.phase === 'preMission'
            ? null
            : lifecycle.runId
      if (runId !== null) {
        lifecycle = appReducer(lifecycle, {
          type: 'suspended',
          runId,
          reason: 'disconnect',
        })
      }
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
      lifecycle.reasons[0] === 'resumeRequired'
    ) {
      lifecycle = appReducer(lifecycle, {
        type: 'warmupRecovered',
        runId,
        warmup: createWarmupSession(fact.occurredAt, state.targetRange, tuning),
      })
    }
  }
  return {
    ...state,
    lifecycle,
    telemetryStatus: fact.status,
    announcement: announcementForTelemetryStatus(fact.status),
  }
}

function handleSample(
  state: MissionFlowState,
  fact: FactOf<'sample'>,
): MissionFlowState {
  const { bpm, occurrenceTimeMs } = fact.sample
  const valid =
    isValidHeartRateBpm(bpm) &&
    bpm >= tuning.heartRateClassifier.plausibleBpm.minimum &&
    bpm <= tuning.heartRateClassifier.plausibleBpm.maximum
  const run = liveRun(state.lifecycle)
  if (run !== null) {
    if (
      state.telemetryStatus.state !== 'connected' ||
      state.pageVisibility === 'hidden'
    ) {
      return state
    }
    const wasActive = state.lifecycle.phase === 'activeMission'
    const authority = advanceActiveRunSignalAuthority(
      run,
      occurrenceTimeMs,
      fact.sequence,
    )
    let advanced = authority.run
    if (advanced.session.result !== null) {
      return {
        ...state,
        lifecycle: updateRunLifecycle(state.lifecycle, advanced),
        announcement: announcementForActiveRunTransition(
          run,
          advanced,
          state.announcement,
          announcementTuning,
        ),
      }
    }
    let lifecycle = applyStaleReason(
      updateRunLifecycle(state.lifecycle, advanced),
      authority.staleAt,
    )
    const suspended =
      lifecycle.phase === 'suspended' &&
      lifecycle.resumeTarget.phase === 'activeMission'
    const classifier = transitionClassifier(
      advanced.classifier,
      { type: 'sample', occurrenceTimeMs, bpm },
      advanced.session.targetRange,
      tuning.heartRateClassifier,
    )
    if (wasActive && !suspended) {
      advanced = advanceRun(advanced, {
        type: 'heartRateSample',
        occurrenceTimeMs,
        sequence: subSequence(fact.sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
        bpm,
      })
    }
    if (advanced.session.result === null) {
      advanced = projectClassifierTransition(
        advanced,
        classifier,
        fact.sequence,
        PUZZLE_COMPLETION_SEQUENCE_OFFSET,
      )
    }
    lifecycle = updateRunLifecycle(lifecycle, advanced)
    if (
      lifecycle.phase === 'suspended' &&
      lifecycle.reasons.includes('staleSignal') &&
      advanced.classifier.signalQuality === 'usable' &&
      advanced.classifier.stableClassification !== null
    ) {
      lifecycle = appReducer(lifecycle, {
        type: 'suspensionCleared',
        runId: lifecycle.resumeTarget.runId,
        reason: 'staleSignal',
      })
    }
    const becameStale = authority.staleAt !== null
    const resumeAvailable =
      !becameStale && canResumeMission({ ...state, lifecycle })
    return {
      ...state,
      lifecycle,
      announcement: becameStale
        ? announcementForInterruption(['signalStale'], state.announcement)
        : resumeAvailable
          ? announcementForInterruption(['resumeAvailable'], state.announcement)
          : wasActive
            ? announcementForActiveRunTransition(
                run,
                advanced,
                state.announcement,
                announcementTuning,
              )
            : state.announcement,
    }
  }
  const session = liveSession(state.lifecycle)
  if (session === null) {
    return valid ? { ...state, latestPreMissionBpm: bpm } : state
  }
  const nextSession = advanceWarmupSession(
    session,
    { type: 'sample', occurrenceTimeMs, bpm },
    tuning,
  )
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

function handleVisibilityChange(
  state: MissionFlowState,
  fact: FactOf<'visibility'>,
): MissionFlowState {
  if (fact.state === state.pageVisibility) return state
  const run = liveRun(state.lifecycle)
  if (run !== null) {
    if (fact.state === 'hidden') {
      const interrupted = interruptActiveRun(
        state,
        fact.occurredAt,
        fact.sequence,
        'hidden',
      )
      return {
        ...state,
        lifecycle: interrupted.lifecycle,
        pageVisibility: 'hidden',
      }
    }
    const authority = advanceActiveRunSignalAuthority(
      run,
      fact.occurredAt,
      fact.sequence,
    )
    let lifecycle = applyStaleReason(
      updateRunLifecycle(state.lifecycle, authority.run),
      authority.staleAt,
    )
    if (
      lifecycle.phase === 'suspended' &&
      lifecycle.reasons.includes('hidden')
    ) {
      lifecycle = appReducer(lifecycle, {
        type: 'suspensionCleared',
        runId: lifecycle.resumeTarget.runId,
        reason: 'hidden',
      })
    }
    return {
      ...state,
      lifecycle,
      pageVisibility: 'visible',
      announcement:
        authority.run.session.result === null
          ? announcementForInterruption(['hiddenRestored'], state.announcement)
          : announcementForActiveRunTransition(
              run,
              authority.run,
              state.announcement,
              announcementTuning,
            ),
    }
  }
  const session = liveSession(state.lifecycle)
  if (session === null) return { ...state, pageVisibility: fact.state }
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
      invalidateWarmupSession(
        session,
        fact.occurredAt,
        'hidden',
        'hidden',
        tuning,
      ),
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
      lifecycle.reasons[0] === 'resumeRequired'
    ) {
      lifecycle = appReducer(lifecycle, {
        type: 'warmupRecovered',
        runId,
        warmup: createWarmupSession(fact.occurredAt, state.targetRange, tuning),
      })
    }
  }
  return {
    ...state,
    lifecycle,
    pageVisibility: fact.state,
    announcement:
      fact.state === 'hidden'
        ? 'Warm-up reset because the page was hidden'
        : 'Page visible. Restart warm-up when ready.',
  }
}

function handleTimeAdvance(
  state: MissionFlowState,
  fact: FactOf<'timeAdvanced'>,
): MissionFlowState {
  const run = liveRun(state.lifecycle)
  if (run !== null) {
    const authority = advanceActiveRunSignalAuthority(
      run,
      fact.occurredAt,
      fact.sequence,
    )
    let advanced = authority.run
    if (
      advanced.session.result === null &&
      state.lifecycle.phase === 'activeMission'
    ) {
      advanced = advanceRun(advanced, {
        type: 'timeAdvanced',
        occurrenceTimeMs: fact.occurredAt,
        sequence: subSequence(fact.sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
      })
    } else if (advanced.session.result === null) {
      advanced = advanceSuspendedRun(advanced, fact.occurredAt, fact.sequence)
    }
    const lifecycle = applyStaleReason(
      updateRunLifecycle(state.lifecycle, advanced),
      authority.staleAt,
    )
    return {
      ...state,
      lifecycle,
      announcement:
        authority.staleAt === null || state.lifecycle.phase === 'suspended'
          ? announcementForActiveRunTransition(
              run,
              advanced,
              state.announcement,
              announcementTuning,
            )
          : announcementForInterruption(['signalStale'], state.announcement),
    }
  }
  const session = liveSession(state.lifecycle)
  if (session === null) return state
  const nextSession = advanceWarmupSession(
    session,
    { type: 'timeAdvanced', occurrenceTimeMs: fact.occurredAt },
    tuning,
  )
  let lifecycle = applySession(state.lifecycle, nextSession, fact.sequence)
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

function assertNeverFact(fact: never): never {
  throw new Error(`Unhandled flow fact: ${String(fact)}`)
}

function sameSource(
  left: HeartRateSourceIdentity | null,
  right: HeartRateSourceIdentity,
): boolean {
  return left?.id === right.id && left.type === right.type
}

function isCurrentTelemetryFact(
  state: MissionFlowState,
  fact: FactOf<'status'> | FactOf<'sample'>,
): boolean {
  if (
    fact.sourceGeneration !== undefined &&
    fact.sourceGeneration !== state.telemetrySourceGeneration
  ) {
    return false
  }
  const source = fact.type === 'status' ? fact.source : fact.sample.source
  return (
    state.telemetrySourceIdentity === null ||
    source === undefined ||
    sameSource(state.telemetrySourceIdentity, source)
  )
}

function reduceMissionFlow(
  state: MissionFlowState,
  fact: MissionFlowFact,
): MissionFlowState {
  if (fact.type === 'resetDiagnostics') return state
  if (
    fact.type === 'timeAdvanced' &&
    fact.runGeneration !== state.runGeneration
  ) {
    return state
  }
  if (
    (fact.type === 'status' || fact.type === 'sample') &&
    !isCurrentTelemetryFact(state, fact)
  ) {
    return state
  }
  if (
    fact.type === 'sourceChanged' &&
    fact.sourceGeneration !== undefined &&
    fact.sourceGeneration <= state.telemetrySourceGeneration
  ) {
    return state
  }
  switch (fact.type) {
    case 'targetDraftChanged':
      return handleTargetDraftChange(state, fact)
    case 'targetCommitted':
      return handleTargetCommit(state, fact)
    case 'sourceChanged':
      return handleSourceChange(state, fact)
    case 'beginWarmup':
      return handleWarmupStart(state, fact)
    case 'backToBriefing':
      return handleBackToBriefing(state)
    case 'manualPause':
      return handleManualPause(state, fact)
    case 'manualResume':
      return handleManualResume(state, fact)
    case 'puzzleTileRotated':
      return handlePuzzleRotation(state, fact)
    case 'puzzleHintRequested':
      return handlePuzzleHintRequest(state, fact)
    case 'puzzleReset':
      return handlePuzzleReset(state, fact)
    case 'status':
      return handleTelemetryStatus(state, fact)
    case 'sample':
      return handleSample(state, fact)
    case 'visibility':
      return handleVisibilityChange(state, fact)
    case 'timeAdvanced':
      return handleTimeAdvance(state, fact)
    default:
      return assertNeverFact(fact)
  }
}

const DIAGNOSTIC_LOG_LIMIT = 1_000

function factOccurrenceTime(fact: MissionFlowFact): number {
  return fact.type === 'sample' ? fact.sample.occurrenceTimeMs : fact.occurredAt
}

export function missionFlowReducer(
  state: MissionFlowState,
  fact: MissionFlowFact,
): MissionFlowState {
  const occurrenceTime = factOccurrenceTime(fact)
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
  const reduced = ignoredOutOfOrder ? state : reduceMissionFlow(state, fact)
  const next = ignoredOutOfOrder
    ? reduced
    : {
        ...reduced,
        lastAppliedOccurrenceTimeMs: occurrenceTime,
        lastAppliedSequence: fact.sequence,
      }
  if (!state.diagnosticsEnabled) return next
  const diagnosticPatch = appendFlowDiagnostics({
    before: state,
    fact,
    after: next,
    occurrenceTime,
    ignoredOutOfOrder,
    tuning: {
      plausibleBpm: tuning.heartRateClassifier.plausibleBpm,
      warmupQualificationMs: tuning.warmup.qualificationMs,
    },
    limit: DIAGNOSTIC_LOG_LIMIT,
  })
  return diagnosticPatch === null ? next : { ...next, ...diagnosticPatch }
}

export function canBeginWarmup(state: MissionFlowState): boolean {
  return (
    state.lifecycle.phase === 'preMission' &&
    state.telemetryStatus.state === 'connected' &&
    state.targetError === null
  )
}
