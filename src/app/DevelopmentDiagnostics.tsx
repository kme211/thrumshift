import { useState } from 'react'

import type { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
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
  const [bpm, setBpm] = useState('110')
  const diagnosticLog = state.diagnosticLog
  return (
    <aside
      className="mx-auto mt-6 max-w-3xl border border-dashed border-[var(--color-border)] p-4"
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
      <label className="mt-3 block">
        <span className="block text-sm">Simulated BPM</span>
        <input
          className="mt-1 min-h-12 w-full border border-[var(--color-border)] bg-[var(--color-canvas)] px-3"
          type="number"
          value={bpm}
          onChange={(event) => setBpm(event.currentTarget.value)}
        />
      </label>
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
