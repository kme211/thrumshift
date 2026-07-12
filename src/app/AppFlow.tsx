import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react'

import { PreMissionScreen } from '../features/PreMissionScreen'
import { WarmupScreen } from '../features/WarmupScreen'
import { LifecycleScreen } from '../features/LifecycleScreen'
import type { MonotonicClock } from '../platform/Clock'
import type { PageVisibility } from '../platform/PageVisibility'
import type { Scheduler } from '../platform/Scheduler'
import type { ScreenWakeLock } from '../platform/ScreenWakeLock'
import type { HeartRateTelemetrySource } from '../telemetry/HeartRateTelemetrySource'
import type { WebBluetoothHeartRateSource } from '../telemetry/bluetooth/WebBluetoothHeartRateSource'
import type { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
import {
  canBeginWarmup,
  createWarmupFlowState,
  warmupFlowReducer,
} from './WarmupFlowController'
import type { WarmupFlowFactPayload } from './WarmupFlowController'

const DevelopmentDiagnostics = import.meta.env.DEV
  ? lazy(() =>
      import('./DevelopmentDiagnostics').then((module) => ({
        default: module.DevelopmentDiagnostics,
      })),
    )
  : null

interface AppFlowProps {
  readonly clock: MonotonicClock
  readonly scheduler: Scheduler
  readonly visibility: PageVisibility
  readonly wakeLock: ScreenWakeLock
  readonly bluetoothSource: WebBluetoothHeartRateSource
  readonly simulatedSource: SimulatedHeartRateSource | null
}

function wantsWakeLock(phase: string): boolean {
  return (
    phase === 'warming' || phase === 'countdown' || phase === 'activeMission'
  )
}

export function AppFlow({
  clock,
  scheduler,
  visibility,
  wakeLock,
  bluetoothSource,
  simulatedSource,
}: AppFlowProps) {
  const [state, dispatch] = useReducer(
    warmupFlowReducer,
    import.meta.env.DEV,
    createWarmupFlowState,
  )
  const nextFactSequence = useRef(0)
  const dispatchFact = useCallback(
    (fact: WarmupFlowFactPayload) =>
      dispatch({ ...fact, sequence: ++nextFactSequence.current }),
    [],
  )
  const [selectedSource, setSelectedSource] = useState<
    'simulated' | 'bluetooth'
  >(simulatedSource === null ? 'bluetooth' : 'simulated')
  const source: HeartRateTelemetrySource =
    selectedSource === 'simulated' && simulatedSource !== null
      ? simulatedSource
      : bluetoothSource

  useEffect(() => {
    const unsubscribeStatus = source.subscribeStatus((status) =>
      dispatchFact({ type: 'status', occurredAt: clock.now(), status }),
    )
    const unsubscribeSamples = source.subscribeSamples((sample) =>
      dispatchFact({ type: 'sample', sample }),
    )
    return () => {
      unsubscribeStatus()
      unsubscribeSamples()
    }
  }, [clock, dispatchFact, source])

  useEffect(
    () =>
      visibility.subscribe((change) =>
        dispatchFact({
          type: 'visibility',
          occurredAt: change.occurredAt,
          state: change.state,
        }),
      ),
    [dispatchFact, visibility],
  )

  useEffect(() => {
    scheduler.cancelAll()
    if (
      state.lifecycle.phase !== 'warming' &&
      state.lifecycle.phase !== 'countdown'
    )
      return
    return scheduler.schedule(250, (occurredAt) =>
      dispatchFact({
        type: 'timeAdvanced',
        occurredAt,
        runGeneration: state.runGeneration,
      }),
    )
  }, [dispatchFact, scheduler, state.lifecycle, state.runGeneration])

  useEffect(() => {
    void wakeLock.setActive(wantsWakeLock(state.lifecycle.phase))
  }, [state.lifecycle.phase, wakeLock])

  useEffect(
    () => () => {
      scheduler.cancelAll()
      void wakeLock.setActive(false)
    },
    [scheduler, wakeLock],
  )

  function selectSource(next: 'simulated' | 'bluetooth'): void {
    if (next === selectedSource) return
    void source.disconnect()
    setSelectedSource(next)
    dispatchFact({ type: 'sourceChanged', occurredAt: clock.now() })
  }

  const targetProps = {
    targetDraft: state.targetDraft,
    targetError: state.targetError,
    onTargetChange: (field: 'lower' | 'upper', value: string) =>
      dispatchFact({
        type: 'targetDraftChanged',
        occurredAt: clock.now(),
        field,
        value,
      }),
    onTargetCommit: () =>
      dispatchFact({ type: 'targetCommitted', occurredAt: clock.now() }),
  }

  let screen
  if (state.lifecycle.phase === 'preMission') {
    screen = (
      <PreMissionScreen
        status={state.telemetryStatus}
        capability={source.capability}
        latestBpm={state.latestPreMissionBpm}
        {...targetProps}
        canBegin={canBeginWarmup(state)}
        showSourceSelector={simulatedSource !== null}
        selectedSource={selectedSource}
        onSelectSource={selectSource}
        onConnect={() => void source.connect()}
        onBegin={() =>
          dispatchFact({ type: 'beginWarmup', occurredAt: clock.now() })
        }
      />
    )
  } else if (
    state.lifecycle.phase === 'warming' ||
    state.lifecycle.phase === 'countdown'
  ) {
    screen = (
      <WarmupScreen
        session={state.lifecycle.warmup}
        status={state.telemetryStatus}
        {...targetProps}
        onConnect={() => void source.connect()}
        onBack={() =>
          dispatchFact({ type: 'backToBriefing', occurredAt: clock.now() })
        }
      />
    )
  } else {
    screen = (
      <LifecycleScreen
        state={state.lifecycle}
        onReconnect={() => void source.connect()}
        onBackToBriefing={() =>
          dispatchFact({
            type: 'backToBriefing',
            occurredAt: clock.now(),
          })
        }
      />
    )
  }

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {state.announcement}
      </div>
      {screen}
      {simulatedSource === null || DevelopmentDiagnostics === null ? null : (
        <Suspense fallback={null}>
          <DevelopmentDiagnostics
            simulatedSource={simulatedSource}
            state={state}
            onResetDiagnostics={() =>
              dispatchFact({
                type: 'resetDiagnostics',
                occurredAt: clock.now(),
              })
            }
          />
        </Suspense>
      )}
    </>
  )
}
