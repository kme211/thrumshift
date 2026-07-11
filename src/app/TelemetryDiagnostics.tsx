import { useEffect, useState } from 'react'

import type { HeartRateSample } from '../domain/heart-rate/types'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'
import { WebBluetoothHeartRateSource } from '../telemetry/bluetooth/WebBluetoothHeartRateSource'
import { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'

interface TelemetryDiagnosticsProps {
  readonly simulatedSource: SimulatedHeartRateSource
  readonly bluetoothSource: WebBluetoothHeartRateSource
}

type SelectedSource = 'simulated' | 'bluetooth'

export function TelemetryDiagnostics({
  simulatedSource,
  bluetoothSource,
}: TelemetryDiagnosticsProps) {
  const [selectedSource, setSelectedSource] =
    useState<SelectedSource>('simulated')
  const source =
    selectedSource === 'simulated' ? simulatedSource : bluetoothSource
  const [status, setStatus] = useState<TelemetrySourceStatus>(
    source.getStatus(),
  )
  const [sample, setSample] = useState<HeartRateSample | null>(null)
  const [bpm, setBpm] = useState('72')
  const [rrInterval, setRrInterval] = useState('833')

  function selectSource(nextSource: SelectedSource): void {
    if (nextSource === selectedSource) {
      return
    }
    void source.disconnect()
    const next = nextSource === 'simulated' ? simulatedSource : bluetoothSource
    setSelectedSource(nextSource)
    setStatus(next.getStatus())
    setSample(null)
  }

  useEffect(() => {
    const unsubscribeStatus = source.subscribeStatus(setStatus)
    const unsubscribeSamples = source.subscribeSamples(setSample)
    return () => {
      unsubscribeStatus()
      unsubscribeSamples()
    }
  }, [source])

  return (
    <aside
      className="mx-auto mt-6 max-w-3xl border border-dashed border-[var(--color-border)] p-4"
      aria-labelledby="telemetry-diagnostics-heading"
    >
      <h2 id="telemetry-diagnostics-heading" className="text-lg font-semibold">
        Development telemetry diagnostics
      </h2>
      <fieldset className="mt-3 flex flex-wrap gap-4">
        <legend className="text-sm font-semibold">Telemetry source</legend>
        <label>
          <input
            type="radio"
            name="telemetry-source"
            value="simulated"
            checked={selectedSource === 'simulated'}
            onChange={() => selectSource('simulated')}
          />{' '}
          Simulator
        </label>
        <label>
          <input
            type="radio"
            name="telemetry-source"
            value="bluetooth"
            checked={selectedSource === 'bluetooth'}
            onChange={() => selectSource('bluetooth')}
          />{' '}
          Web Bluetooth
        </label>
      </fieldset>
      <p className="mt-1 text-[var(--color-text-muted)]">
        Status: {status.state}
        {status.state === 'error' ? ` — ${status.error.message}` : ''}
      </p>
      {selectedSource === 'bluetooth' && !source.capability.supported ? (
        <p className="mt-1 text-[var(--color-text-muted)]">
          Capability:{' '}
          {source.capability.reason === 'insecure-context'
            ? 'requires HTTPS or localhost'
            : 'Web Bluetooth is unavailable in this browser'}
        </p>
      ) : null}
      <output
        className="mt-4 block text-5xl font-bold"
        aria-label="Current heart rate"
      >
        {sample === null ? '—' : sample.bpm}{' '}
        <span className="text-lg">BPM</span>
      </output>
      <p className="mt-1 text-[var(--color-text-muted)]">
        RR interval: {sample?.rrIntervalsMs?.join(', ') ?? '—'} ms
      </p>

      {selectedSource === 'simulated' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="block text-sm">BPM</span>
            <input
              className="mt-1 min-h-12 w-full border border-[var(--color-border)] bg-[var(--color-canvas)] px-3"
              type="number"
              min="1"
              max="65535"
              value={bpm}
              onChange={(event) => setBpm(event.currentTarget.value)}
            />
          </label>
          <label>
            <span className="block text-sm">RR interval (ms)</span>
            <input
              className="mt-1 min-h-12 w-full border border-[var(--color-border)] bg-[var(--color-canvas)] px-3"
              type="number"
              min="1"
              value={rrInterval}
              onChange={(event) => setRrInterval(event.currentTarget.value)}
            />
          </label>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!source.capability.supported}
          onClick={() => void source.connect()}
        >
          {selectedSource === 'simulated'
            ? 'Connect simulator'
            : 'Choose heart-rate monitor'}
        </button>
        {selectedSource === 'simulated' ? (
          <>
            <button
              type="button"
              onClick={() =>
                simulatedSource.emitSample(
                  Number(bpm),
                  rrInterval.trim() === '' ? undefined : [Number(rrInterval)],
                )
              }
            >
              Emit sample
            </button>
            <button
              type="button"
              onClick={() =>
                simulatedSource.emitError('Manual simulated source error')
              }
            >
              Emit error
            </button>
          </>
        ) : null}
        <button type="button" onClick={() => void source.disconnect()}>
          Disconnect
        </button>
      </div>
    </aside>
  )
}
