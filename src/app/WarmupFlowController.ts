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
  ClassifierTransition,
  TargetRange,
} from '../domain/heart-rate/classifier'
import { isValidHeartRateBpm } from '../domain/heart-rate/range'
import type { HeartRateSample } from '../domain/heart-rate/types'
import { getMissionIntervalBehavior } from '../domain/mission/activeMission'
import { advanceMissionSession } from '../domain/mission/missionSession'
import type { MissionSessionFact } from '../domain/mission/missionStatistics'
import {
  isPuzzleComplete,
  resetPuzzle,
  rotateTile,
  selectPuzzleHint,
} from '../domain/puzzle/model'
import { createWarmupState, transitionWarmup } from '../domain/mission/warmup'
import type { WarmupFact, WarmupState } from '../domain/mission/warmup'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'
import type { AppState } from './AppState'
import { appReducer } from './appReducer'
import type { MissionResult } from '../domain/mission/MissionResult'
import { createMissionRun } from './MissionRun'
import type { MissionRun } from './MissionRun'
import { appendFlowDiagnostics } from './FlowDiagnostics'
import type { WarmupTelemetryDiagnosticEntry } from './FlowDiagnostics'

export type { WarmupTelemetryDiagnosticEntry } from './FlowDiagnostics'

export interface WarmupSession {
  readonly targetRange: TargetRange
  readonly classifier: ClassifierState
  readonly warmup: WarmupState
}

export type WarmupFlowLifecycle = AppState<
  WarmupSession,
  MissionRun,
  MissionResult
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
  sequence = 0,
): WarmupFlowLifecycle {
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

function liveRun(lifecycle: WarmupFlowLifecycle): MissionRun | null {
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
  lifecycle: WarmupFlowLifecycle,
  run: MissionRun,
): WarmupFlowLifecycle {
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

const DERIVED_SIGNAL_SEQUENCE_OFFSET = 1
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
function advanceActiveRunSignalAuthority(
  run: MissionRun,
  occurredAt: number,
  sequence: number,
): MissionRun {
  const transition = transitionClassifier(
    run.classifier,
    { type: 'timeAdvanced', occurrenceTimeMs: occurredAt },
    run.session.targetRange,
    tuning.heartRateClassifier,
  )
  return projectClassifierTransition(
    run,
    transition,
    sequence,
    DERIVED_SIGNAL_SEQUENCE_OFFSET,
  )
}

function activeRunAnnouncement(
  before: MissionRun,
  after: MissionRun,
  fallback: string,
): string {
  const announcements: string[] = []
  const previousClassification = before.classifier.stableClassification
  const currentClassification = after.classifier.stableClassification
  if (previousClassification !== currentClassification) {
    if (currentClassification === 'below')
      announcements.push('Heart rate is below range')
    if (currentClassification === 'operational')
      announcements.push('Heart rate is operational')
    if (currentClassification === 'above')
      announcements.push('Heart rate is above range')
    if (currentClassification === null)
      announcements.push('Stable heart-rate classification unavailable')
  }

  function stabilityTrend(run: MissionRun): string {
    const behavior = getMissionIntervalBehavior(run.session.mission)
    if (behavior === 'activeBelowRange' || behavior === 'activeAboveRange')
      return 'decreasing'
    if (
      behavior === 'activeOperational' &&
      run.session.mission.stability < tuning.stability.maximum
    )
      return 'recovering'
    if (behavior === 'suspended') return 'paused'
    return 'holding'
  }

  const previousTrend = stabilityTrend(before)
  const currentTrend = stabilityTrend(after)
  if (previousTrend !== currentTrend && currentTrend !== 'paused') {
    announcements.push(`Station stability is ${currentTrend}`)
  }

  const previous = before.session.mission.stability
  const current = after.session.mission.stability
  for (const threshold of [75, 50, 25]) {
    if (previous > threshold && current <= threshold) {
      announcements.push(
        threshold === 75
          ? 'Station stability warning: 75 percent'
          : `Station stability critical: ${threshold} percent`,
      )
    }
  }
  return announcements.length === 0 ? fallback : announcements.join('. ')
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
  if (fact.type === 'manualPause') {
    const run = liveRun(state.lifecycle)
    if (run === null || state.lifecycle.phase !== 'activeMission') return state
    const runId = state.lifecycle.runId
    let advanced = advanceActiveRunSignalAuthority(
      run,
      fact.occurredAt,
      fact.sequence,
    )
    if (advanced.session.result !== null) {
      return {
        ...state,
        lifecycle: updateRunLifecycle(state.lifecycle, advanced),
        announcement: activeRunAnnouncement(run, advanced, state.announcement),
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
    let lifecycle = updateRunLifecycle(state.lifecycle, advanced)
    if (lifecycle.phase === 'activeMission') {
      lifecycle = appReducer(lifecycle, {
        type: 'suspended',
        runId,
        reason: 'manual',
      })
    }
    return { ...state, lifecycle, announcement: 'Mission paused' }
  }
  if (fact.type === 'manualResume') {
    const run = liveRun(state.lifecycle)
    if (
      run === null ||
      state.lifecycle.phase !== 'suspended' ||
      state.lifecycle.resumeTarget.phase !== 'activeMission' ||
      state.lifecycle.reasons.length !== 1 ||
      state.lifecycle.reasons[0] !== 'manual'
    )
      return state
    const runId = state.lifecycle.resumeTarget.runId
    let advanced = advanceActiveRunSignalAuthority(
      run,
      fact.occurredAt,
      fact.sequence,
    )
    advanced = advanceRun(advanced, {
      type: 'lifecycleProjectionChanged',
      occurrenceTimeMs: fact.occurredAt,
      sequence: subSequence(fact.sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
      suspended: false,
      disconnected: false,
    })
    let lifecycle = updateRunLifecycle(state.lifecycle, advanced)
    if (lifecycle.phase === 'suspended') {
      lifecycle = appReducer(lifecycle, { type: 'resumed', runId })
    }
    return { ...state, lifecycle, announcement: 'Mission resumed' }
  }
  if (fact.type === 'puzzleTileRotated') {
    const run = liveRun(state.lifecycle)
    if (run === null || state.lifecycle.phase !== 'activeMission') return state
    let advanced = advanceActiveRunSignalAuthority(
      run,
      fact.occurredAt,
      fact.sequence,
    )
    if (advanced.session.result !== null) {
      return {
        ...state,
        lifecycle: updateRunLifecycle(state.lifecycle, advanced),
        announcement: activeRunAnnouncement(run, advanced, state.announcement),
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
        announcement: activeRunAnnouncement(run, advanced, state.announcement),
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
  if (fact.type === 'puzzleHintRequested') {
    const run = liveRun(state.lifecycle)
    if (run === null || state.lifecycle.phase !== 'activeMission') return state
    let advanced = advanceActiveRunSignalAuthority(
      run,
      fact.occurredAt,
      fact.sequence,
    )
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
      advanced = {
        ...advanced,
        hint,
      }
    }
    return {
      ...state,
      lifecycle: updateRunLifecycle(state.lifecycle, advanced),
      announcement: state.announcement,
    }
  }
  if (fact.type === 'puzzleReset') {
    const run = liveRun(state.lifecycle)
    if (run === null || state.lifecycle.phase !== 'activeMission') return state
    let advanced = advanceActiveRunSignalAuthority(
      run,
      fact.occurredAt,
      fact.sequence,
    )
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
          : activeRunAnnouncement(run, advanced, state.announcement),
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
    const run = liveRun(state.lifecycle)
    if (run !== null) {
      if (state.lifecycle.phase !== 'activeMission') return state
      let advanced = advanceActiveRunSignalAuthority(
        run,
        occurrenceTimeMs,
        fact.sequence,
      )
      if (advanced.session.result !== null) {
        return {
          ...state,
          lifecycle: updateRunLifecycle(state.lifecycle, advanced),
          announcement: activeRunAnnouncement(
            run,
            advanced,
            state.announcement,
          ),
        }
      }
      const classifier = transitionClassifier(
        advanced.classifier,
        { type: 'sample', occurrenceTimeMs, bpm },
        advanced.session.targetRange,
        tuning.heartRateClassifier,
      )
      advanced = advanceRun(advanced, {
        type: 'heartRateSample',
        occurrenceTimeMs,
        sequence: subSequence(fact.sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
        bpm,
      })
      if (advanced.session.result === null) {
        advanced = projectClassifierTransition(
          advanced,
          classifier,
          fact.sequence,
          PUZZLE_COMPLETION_SEQUENCE_OFFSET,
        )
      }
      return {
        ...state,
        lifecycle: updateRunLifecycle(state.lifecycle, advanced),
        announcement: activeRunAnnouncement(run, advanced, state.announcement),
      }
    }
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
  const run = liveRun(state.lifecycle)
  if (run !== null) {
    if (state.lifecycle.phase !== 'activeMission') return state
    let advanced = advanceActiveRunSignalAuthority(
      run,
      fact.occurredAt,
      fact.sequence,
    )
    if (advanced.session.result === null) {
      advanced = advanceRun(advanced, {
        type: 'timeAdvanced',
        occurrenceTimeMs: fact.occurredAt,
        sequence: subSequence(fact.sequence, EXTERNAL_FACT_SEQUENCE_OFFSET),
      })
    }
    return {
      ...state,
      lifecycle: updateRunLifecycle(state.lifecycle, advanced),
      announcement: activeRunAnnouncement(run, advanced, state.announcement),
    }
  }
  const session = liveSession(state.lifecycle)
  if (session === null) return state
  const nextSession = transitionSession(session, {
    type: 'timeAdvanced',
    occurrenceTimeMs: fact.occurredAt,
  })
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

const DIAGNOSTIC_LOG_LIMIT = 1_000

function factOccurrenceTime(fact: WarmupFlowFact): number {
  return fact.type === 'sample' ? fact.sample.occurrenceTimeMs : fact.occurredAt
}

export function warmupFlowReducer(
  state: WarmupFlowState,
  fact: WarmupFlowFact,
): WarmupFlowState {
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
  const reduced = ignoredOutOfOrder ? state : reduceWarmupFlow(state, fact)
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

export function canBeginWarmup(state: WarmupFlowState): boolean {
  return (
    state.lifecycle.phase === 'preMission' &&
    state.telemetryStatus.state === 'connected' &&
    state.targetError === null
  )
}
