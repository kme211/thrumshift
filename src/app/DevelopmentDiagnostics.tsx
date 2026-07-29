import { useEffect, useState } from 'react'

import {
  SIMULATED_HR6_CADENCE_MS,
  type ContinuousEmissionState,
  type SimulatedHeartRateSource,
} from '../telemetry/simulated/SimulatedHeartRateSource'
import type { WarmupFlowState } from './WarmupFlowController'
import { downloadDiagnosticLog } from './diagnosticExport'

export function DevelopmentDiagnostics({
  simulatedSource,
  state,
  onResetDiagnostics,
}: {
  readonly simulatedSource: SimulatedHeartRateSource
  readonly state: WarmupFlowState
  readonly onResetDiagnostics: () => void
}) {
  const [emission, setEmission] = useState<ContinuousEmissionState>(() =>
    simulatedSource.getContinuousEmissionState(),
  )
  const [bpm, setBpm] = useState(() => String(emission.bpm))
  const [cadence, setCadence] = useState(() => String(emission.cadenceMs))
  useEffect(
    () => simulatedSource.subscribeContinuousEmission(setEmission),
    [simulatedSource],
  )
  const diagnosticLog = state.diagnosticLog
  const activeRun =
    state.lifecycle.phase === 'activeMission'
      ? state.lifecycle.mission
      : state.lifecycle.phase === 'suspended' &&
          state.lifecycle.resumeTarget.phase === 'activeMission'
        ? state.lifecycle.resumeTarget.mission
        : null
  const finalizedResult =
    state.lifecycle.phase === 'result' ? state.lifecycle.result : null
  return (
    <aside
      className="development-diagnostics mx-auto mt-6 max-w-3xl border border-dashed border-[var(--color-border)]"
      aria-labelledby="development-diagnostics-heading"
    >
      <h2
        id="development-diagnostics-heading"
        className="text-lg font-semibold"
      >
        Development diagnostics
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        These controls emit through the same selected simulator contract used by
        the product flow.
      </p>
      <p className="mt-2 text-sm">
        Diagnostic events captured: {diagnosticLog.length}
      </p>
      {activeRun === null && finalizedResult === null ? null : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt>Active play</dt>
          <dd>
            {Math.round(
              (activeRun?.session.mission.activeElapsedTimeMs ??
                finalizedResult?.activeDurationMs ??
                0) / 1_000,
            )}{' '}
            seconds
          </dd>
          <dt>Puzzle moves</dt>
          <dd>
            {activeRun?.session.statistics.puzzleMoveCount ??
              finalizedResult?.puzzleMoveCount}
          </dd>
          <dt>Hint used</dt>
          <dd>
            {(activeRun?.session.statistics.hintUsed ??
            finalizedResult?.hintUsed)
              ? 'yes'
              : 'no'}
          </dd>
          <dt>Station stability</dt>
          <dd>
            {Math.round(
              activeRun?.session.mission.stability ??
                finalizedResult?.endingStability ??
                0,
            )}
            %
          </dd>
        </dl>
      )}
      <label className="mt-3 block">
        <span className="block text-sm">Simulated BPM</span>
        <input
          className="mt-1 min-h-12 w-full border border-[var(--color-border)] bg-[var(--color-canvas)] px-3"
          type="number"
          value={bpm}
          onChange={(event) => {
            const value = event.currentTarget.value
            setBpm(value)
            const nextBpm = Number(value)
            if (
              emission.running &&
              value.trim() !== '' &&
              Number.isInteger(nextBpm) &&
              nextBpm > 0
            )
              simulatedSource.setContinuousBpm(nextBpm)
          }}
        />
      </label>
      <label className="mt-3 block">
        <span className="block text-sm">Sample cadence (ms)</span>
        <input
          className="mt-1 min-h-12 w-full border border-[var(--color-border)] bg-[var(--color-canvas)] px-3"
          type="number"
          min="1"
          value={cadence}
          onChange={(event) => setCadence(event.currentTarget.value)}
        />
      </label>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        HR6 observed cadence preset: approximately{' '}
        {SIMULATED_HR6_CADENCE_MS.toLocaleString()} ms. Continuous samples:{' '}
        {emission.running ? 'running' : 'stopped'}.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => simulatedSource.emitSample(Number(bpm))}
        >
          Emit simulated sample
        </button>
        <button
          type="button"
          onClick={() =>
            simulatedSource.startContinuousSamples(Number(bpm), Number(cadence))
          }
        >
          {emission.running ? 'Restart Samples' : 'Start Samples'}
        </button>
        <button
          type="button"
          disabled={!emission.running}
          onClick={() => simulatedSource.stopContinuousSamples()}
        >
          Stop Samples
        </button>
        <button
          type="button"
          onClick={() =>
            simulatedSource.emitError('Manual simulated source error')
          }
        >
          Emit invalid signal
        </button>
        <button type="button" onClick={() => void simulatedSource.disconnect()}>
          Disconnect simulator
        </button>
        <button
          type="button"
          disabled={diagnosticLog.length === 0}
          onClick={() =>
            downloadDiagnosticLog(state, {
              userAgent: navigator.userAgent,
              secureContext: window.isSecureContext,
              bluetoothSupported: 'bluetooth' in navigator,
              visibilityState: document.visibilityState,
            })
          }
        >
          Export diagnostic log
        </button>
        <button
          type="button"
          disabled={diagnosticLog.length === 0}
          onClick={onResetDiagnostics}
        >
          Reset diagnostic log
        </button>
      </div>
    </aside>
  )
}
