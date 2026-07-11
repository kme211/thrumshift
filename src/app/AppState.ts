export type RunId = string

export type SuspensionReason =
  'manual' | 'hidden' | 'disconnect' | 'staleSignal'

export type NonEmptyReasons = readonly [SuspensionReason, ...SuspensionReason[]]

export interface PreMissionState {
  readonly phase: 'preMission'
}

export interface WarmingState<WarmupState> {
  readonly phase: 'warming'
  readonly runId: RunId
  readonly warmup: WarmupState
}

export interface CountdownState<WarmupState> {
  readonly phase: 'countdown'
  readonly runId: RunId
  readonly warmup: WarmupState
}

export interface ActiveMissionState<MissionState> {
  readonly phase: 'activeMission'
  readonly runId: RunId
  readonly mission: MissionState
}

export type ResumeTarget<WarmupState, MissionState> =
  | WarmingState<WarmupState>
  | CountdownState<WarmupState>
  | ActiveMissionState<MissionState>

export interface SuspendedState<WarmupState, MissionState> {
  readonly phase: 'suspended'
  readonly resumeTarget: ResumeTarget<WarmupState, MissionState>
  readonly reasons: NonEmptyReasons
}

export interface ResultState<Result> {
  readonly phase: 'result'
  readonly runId: RunId
  readonly result: Result
}

export type AppState<WarmupState, MissionState, Result> =
  | PreMissionState
  | WarmingState<WarmupState>
  | CountdownState<WarmupState>
  | ActiveMissionState<MissionState>
  | SuspendedState<WarmupState, MissionState>
  | ResultState<Result>

export type AppEvent<WarmupState, MissionState, Result> =
  | {
      readonly type: 'warmupStarted'
      readonly runId: RunId
      readonly warmup: WarmupState
    }
  | {
      readonly type: 'warmupUpdated'
      readonly runId: RunId
      readonly warmup: WarmupState
    }
  | {
      readonly type: 'countdownStarted'
      readonly runId: RunId
      readonly warmup: WarmupState
    }
  | {
      readonly type: 'missionStarted'
      readonly runId: RunId
      readonly mission: MissionState
    }
  | {
      readonly type: 'missionUpdated'
      readonly runId: RunId
      readonly mission: MissionState
    }
  | {
      readonly type: 'suspended'
      readonly runId: RunId
      readonly reason: SuspensionReason
    }
  | {
      readonly type: 'suspensionCleared'
      readonly runId: RunId
      readonly reason: Exclude<SuspensionReason, 'manual'>
    }
  | { readonly type: 'resumed'; readonly runId: RunId }
  | {
      readonly type: 'warmupRecovered'
      readonly runId: RunId
      readonly warmup: WarmupState
    }
  | {
      readonly type: 'runEnded'
      readonly runId: RunId
      readonly result: Result
    }
  | { readonly type: 'runAbandoned'; readonly runId: RunId }
  | { readonly type: 'runAgain' }

/**
 * Lifecycle design contracts for this gate and later gates:
 *
 * Canonical domain ownership: A live run has one run identity and exactly one
 * canonical warm-up or mission value. The reducer stores values produced by
 * domain transitions; it does not derive or mirror them.
 *
 * Suspension reason integrity: A reducer-produced suspension has a nonempty,
 * duplicate-free reason set and exactly one resumable target.
 *
 * Explicit recovery: Clearing automatic blockers never resumes a run. Only an
 * active mission can resume explicitly; warming and countdown recover through a
 * fresh warm-up value supplied by the controller.
 *
 * Finalization: A finalized run rejects every run-scoped event. `runAgain` is a
 * navigation event that returns to pre-mission without mutating the old run.
 *
 * These contracts are documentation, not production data or a runtime
 * validation framework. Focused reducer tests are their executable proof.
 */

export const initialAppState: PreMissionState = { phase: 'preMission' }

export function getRunId<WarmupState, MissionState, Result>(
  state: AppState<WarmupState, MissionState, Result>,
): RunId | null {
  if (state.phase === 'preMission') {
    return null
  }
  return state.phase === 'suspended' ? state.resumeTarget.runId : state.runId
}
