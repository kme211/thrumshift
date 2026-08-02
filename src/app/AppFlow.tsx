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
import { ActiveMissionScreen } from '../features/ActiveMissionScreen'
import { MissionResultPanel } from '../features/mission-result/MissionResultPanel'
import type { MonotonicClock } from '../platform/Clock'
import type { PageVisibility } from '../platform/PageVisibility'
import type { Scheduler } from '../platform/Scheduler'
import type { ScreenWakeLock } from '../platform/ScreenWakeLock'
import type { HeartRateTelemetrySource } from '../telemetry/HeartRateTelemetrySource'
import type { WebBluetoothHeartRateSource } from '../telemetry/bluetooth/WebBluetoothHeartRateSource'
import type { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
import {
  canBeginWarmup,
  canResumeMission,
  createMissionFlowState,
  missionFlowReducer,
} from './MissionFlowController'
import type { MissionFlowFactPayload } from './MissionFlowController'
import { getMissionHintEligibility } from './MissionRun'

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

function wantsWakeLock(state: {
  readonly lifecycle: { readonly phase: string }
  readonly pageVisibility: 'visible' | 'hidden'
}): boolean {
  return (
    state.pageVisibility === 'visible' &&
    (state.lifecycle.phase === 'warming' ||
      state.lifecycle.phase === 'countdown' ||
      state.lifecycle.phase === 'activeMission')
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
    missionFlowReducer,
    import.meta.env.DEV,
    createMissionFlowState,
  )
  const nextFactSequence = useRef(0)
  const nextSourceGeneration = useRef(0)
  const dispatchFact = useCallback(
    (fact: MissionFlowFactPayload) =>
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
  const wakeLockActive = wantsWakeLock(state)

  useEffect(() => {
    const sourceGeneration = ++nextSourceGeneration.current
    dispatchFact({
      type: 'sourceChanged',
      occurredAt: clock.now(),
      source: source.identity,
      sourceGeneration,
    })
    const unsubscribeStatus = source.subscribeStatus((status) =>
      dispatchFact({
        type: 'status',
        occurredAt: clock.now(),
        status,
        source: source.identity,
        sourceGeneration,
      }),
    )
    const unsubscribeSamples = source.subscribeSamples((sample) =>
      dispatchFact({ type: 'sample', sample, sourceGeneration }),
    )
    return () => {
      unsubscribeStatus()
      unsubscribeSamples()
    }
  }, [clock, dispatchFact, source])

  useEffect(() => {
    dispatchFact({
      type: 'visibility',
      occurredAt: clock.now(),
      state: visibility.getState(),
    })
    return visibility.subscribe((change) =>
      dispatchFact({
        type: 'visibility',
        occurredAt: change.occurredAt,
        state: change.state,
      }),
    )
  }, [clock, dispatchFact, visibility])

  useEffect(() => {
    scheduler.cancelAll()
    if (
      state.lifecycle.phase !== 'warming' &&
      state.lifecycle.phase !== 'countdown' &&
      state.lifecycle.phase !== 'activeMission'
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
    void wakeLock.setActive(wakeLockActive)
  }, [wakeLock, wakeLockActive])

  useEffect(
    () => () => {
      scheduler.cancelAll()
      void wakeLock.setActive(false)
    },
    [scheduler, wakeLock],
  )

  useEffect(
    () => () => simulatedSource?.stopContinuousSamples(),
    [simulatedSource],
  )

  function selectSource(next: 'simulated' | 'bluetooth'): void {
    if (next === selectedSource) return
    void source.disconnect()
    setSelectedSource(next)
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
          dispatchFact({
            type: 'backToBriefing',
            occurredAt: clock.now(),
            runGeneration: state.runGeneration,
          })
        }
      />
    )
  } else if (
    state.lifecycle.phase === 'activeMission' ||
    (state.lifecycle.phase === 'suspended' &&
      state.lifecycle.resumeTarget.phase === 'activeMission')
  ) {
    const run =
      state.lifecycle.phase === 'activeMission'
        ? state.lifecycle.mission
        : state.lifecycle.resumeTarget.phase === 'activeMission'
          ? state.lifecycle.resumeTarget.mission
          : null
    if (run === null) throw new Error('Active mission screen requires a run')
    const hintEligibility = getMissionHintEligibility(run)
    screen = (
      <ActiveMissionScreen
        run={run}
        telemetryStatus={state.telemetryStatus}
        paused={state.lifecycle.phase === 'suspended'}
        suspensionReasons={
          state.lifecycle.phase === 'suspended' ? state.lifecycle.reasons : []
        }
        pageVisible={state.pageVisibility === 'visible'}
        canResume={canResumeMission(state)}
        hintEligible={hintEligibility.eligible}
        hintRemainingMs={hintEligibility.remainingMs}
        onRotate={(tileId) =>
          dispatchFact({
            type: 'puzzleTileRotated',
            occurredAt: clock.now(),
            runGeneration: state.runGeneration,
            tileId,
          })
        }
        onHint={() =>
          dispatchFact({
            type: 'puzzleHintRequested',
            occurredAt: clock.now(),
            runGeneration: state.runGeneration,
          })
        }
        onReset={() =>
          dispatchFact({
            type: 'puzzleReset',
            occurredAt: clock.now(),
            runGeneration: state.runGeneration,
          })
        }
        onPause={() =>
          dispatchFact({
            type: 'manualPause',
            occurredAt: clock.now(),
            runGeneration: state.runGeneration,
          })
        }
        onResume={() =>
          dispatchFact({
            type: 'manualResume',
            occurredAt: clock.now(),
            runGeneration: state.runGeneration,
          })
        }
        onReconnect={() => void source.connect()}
        onEndRun={() =>
          dispatchFact({
            type: 'backToBriefing',
            occurredAt: clock.now(),
            runGeneration: state.runGeneration,
          })
        }
      />
    )
  } else if (state.lifecycle.phase === 'result') {
    screen = (
      <MissionResultPanel
        result={state.lifecycle.result}
        onRunAgain={() =>
          dispatchFact({
            type: 'runAgain',
            occurredAt: clock.now(),
            runGeneration: state.runGeneration,
          })
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
            runGeneration: state.runGeneration,
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
