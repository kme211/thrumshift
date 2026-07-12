import { lazy, Suspense, useEffect, useReducer, useRef } from 'react'

import { LifecycleScreen } from '../features/LifecycleScreen'
import type {
  PageVisibility,
  PageVisibilityChange,
} from '../platform/PageVisibility'
import type { ScreenWakeLock } from '../platform/ScreenWakeLock'
import type { WebBluetoothHeartRateSource } from '../telemetry/bluetooth/WebBluetoothHeartRateSource'
import type { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
import type { AppState } from './AppState'
import { getRunId, initialAppState } from './AppState'
import { appReducer } from './appReducer'
import type {
  ShellMissionState,
  ShellResult,
  ShellWarmupState,
} from './ShellState'
import { freshShellWarmup } from './ShellState'

type State = AppState<ShellWarmupState, ShellMissionState, ShellResult>

const DevelopmentDiagnostics = import.meta.env.DEV
  ? lazy(() =>
      import('./DevelopmentDiagnostics').then((module) => ({
        default: module.DevelopmentDiagnostics,
      })),
    )
  : null

interface AppFlowProps {
  readonly visibility: PageVisibility
  readonly wakeLock: ScreenWakeLock
  readonly diagnostics: {
    readonly simulatedSource: SimulatedHeartRateSource
    readonly bluetoothSource: WebBluetoothHeartRateSource
  } | null
}

function wantsWakeLock(state: State): boolean {
  return (
    state.phase === 'warming' ||
    state.phase === 'countdown' ||
    state.phase === 'activeMission'
  )
}

export function AppFlow({ visibility, wakeLock, diagnostics }: AppFlowProps) {
  const [state, dispatch] = useReducer(
    appReducer<ShellWarmupState, ShellMissionState, ShellResult>,
    initialAppState,
  )
  const nextRun = useRef(0)
  const stateRef = useRef<State>(state)
  stateRef.current = state

  useEffect(() => {
    function handleVisibility(change: PageVisibilityChange): void {
      const current = stateRef.current
      const runId = getRunId(current)
      if (runId === null || current.phase === 'result') return

      if (change.state === 'hidden') {
        dispatch({ type: 'suspended', runId, reason: 'hidden' })
        return
      }
      if (current.phase === 'suspended' && current.reasons.includes('hidden')) {
        const hiddenWasSoleReason =
          current.reasons.length === 1 && current.reasons[0] === 'hidden'
        dispatch({ type: 'suspensionCleared', runId, reason: 'hidden' })
        if (
          hiddenWasSoleReason &&
          current.resumeTarget.phase !== 'activeMission'
        ) {
          dispatch({
            type: 'warmupRecovered',
            runId,
            warmup: freshShellWarmup(),
          })
        }
      }
    }

    const unsubscribe = visibility.subscribe(handleVisibility)
    return unsubscribe
  }, [visibility])

  useEffect(() => {
    void wakeLock.setActive(wantsWakeLock(state))
  }, [state, wakeLock])

  useEffect(
    () => () => {
      void wakeLock.setActive(false)
    },
    [wakeLock],
  )

  return (
    <>
      <LifecycleScreen state={state} />
      {diagnostics === null || DevelopmentDiagnostics === null ? null : (
        <Suspense fallback={null}>
          <DevelopmentDiagnostics
            {...diagnostics}
            state={state}
            dispatch={dispatch}
            startWarmup={() => {
              nextRun.current += 1
              dispatch({
                type: 'warmupStarted',
                runId: `development-run-${nextRun.current}`,
                warmup: freshShellWarmup(),
              })
            }}
          />
        </Suspense>
      )}
    </>
  )
}
