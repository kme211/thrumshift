import type { AppEvent, AppState, SuspensionReason } from './AppState'
import type {
  ShellMissionState,
  ShellResult,
  ShellWarmupState,
} from './ShellState'
import { freshShellMission, freshShellWarmup } from './ShellState'

type State = AppState<ShellWarmupState, ShellMissionState, ShellResult>
type Event = AppEvent<ShellWarmupState, ShellMissionState, ShellResult>

interface LifecycleDiagnosticsProps {
  readonly state: State
  readonly startWarmup: () => void
  readonly dispatch: (event: Event) => void
}

function getRunId(state: Exclude<State, { phase: 'preMission' }>): string {
  return state.phase === 'suspended' ? state.resumeTarget.runId : state.runId
}

export function LifecycleDiagnostics({
  state,
  startWarmup,
  dispatch,
}: LifecycleDiagnosticsProps) {
  if (state.phase === 'preMission') {
    return (
      <button type="button" onClick={startWarmup}>
        Begin fake warm-up
      </button>
    )
  }

  const runId = getRunId(state)
  const suspend = (reason: SuspensionReason) =>
    dispatch({ type: 'suspended', runId, reason })

  return (
    <div className="flex flex-wrap gap-3">
      {state.phase === 'warming' ? (
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'countdownStarted', runId, warmup: state.warmup })
          }
        >
          Begin fake countdown
        </button>
      ) : null}
      {state.phase === 'countdown' ? (
        <>
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'missionStarted',
                runId,
                mission: freshShellMission(),
              })
            }
          >
            Begin fake mission
          </button>
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'warmupUpdated',
                runId,
                warmup: freshShellWarmup(),
              })
            }
          >
            Revoke fake qualification
          </button>
        </>
      ) : null}
      {state.phase === 'activeMission' ? (
        <>
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'runEnded',
                runId,
                result: { outcome: 'success' },
              })
            }
          >
            Show fake success
          </button>
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'runEnded',
                runId,
                result: { outcome: 'failure' },
              })
            }
          >
            Show fake failure
          </button>
        </>
      ) : null}
      {state.phase === 'warming' ||
      state.phase === 'countdown' ||
      state.phase === 'activeMission' ? (
        <>
          <button type="button" onClick={() => suspend('manual')}>
            Pause
          </button>
          <button type="button" onClick={() => suspend('disconnect')}>
            Simulate disconnect
          </button>
        </>
      ) : null}
      {state.phase === 'suspended' ? (
        <>
          {state.reasons
            .filter(
              (reason): reason is Exclude<SuspensionReason, 'manual'> =>
                reason !== 'manual',
            )
            .map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() =>
                  dispatch({ type: 'suspensionCleared', runId, reason })
                }
              >
                Clear {reason}
              </button>
            ))}
          {state.reasons.length === 1 && state.reasons[0] === 'manual' ? (
            state.resumeTarget.phase === 'activeMission' ? (
              <button
                type="button"
                onClick={() => dispatch({ type: 'resumed', runId })}
              >
                Resume mission
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: 'warmupRecovered',
                    runId,
                    warmup: freshShellWarmup(),
                  })
                }
              >
                Restart fake warm-up
              </button>
            )
          ) : null}
        </>
      ) : null}
      {state.phase === 'result' ? (
        <button type="button" onClick={() => dispatch({ type: 'runAgain' })}>
          Run again
        </button>
      ) : (
        <button
          type="button"
          onClick={() => dispatch({ type: 'runAbandoned', runId })}
        >
          Back to briefing
        </button>
      )}
    </div>
  )
}
