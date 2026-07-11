import { useEffect, useState } from 'react'

import type { HeartRateSample } from '../domain/heart-rate/types'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'
import { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'

interface TelemetryDiagnosticsProps {
  readonly source: SimulatedHeartRateSource
}

export function TelemetryDiagnostics({ source }: TelemetryDiagnosticsProps) {
  const [status, setStatus] = useState<TelemetrySourceStatus>(
    source.getStatus(),
  )
  const [sample, setSample] = useState<HeartRateSample | null>(null)
  const [bpm, setBpm] = useState('72')
  const [rrInterval, setRrInterval] = useState('833')

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
      <p className="mt-1 text-[var(--color-text-muted)]">
        Status: {status.state}
        {status.state === 'error' ? ` — ${status.error.message}` : ''}
      </p>
      <output
        className="mt-4 block text-5xl font-bold"
        aria-label="Current simulated heart rate"
      >
        {sample === null ? '—' : sample.bpm}{' '}
        <span className="text-lg">BPM</span>
      </output>
      <p className="mt-1 text-[var(--color-text-muted)]">
        RR interval: {sample?.rrIntervalsMs?.join(', ') ?? '—'} ms
      </p>

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

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => void source.connect()}>
          Connect simulator
        </button>
        <button
          type="button"
          onClick={() =>
            source.emitSample(
              Number(bpm),
              rrInterval.trim() === '' ? undefined : [Number(rrInterval)],
            )
          }
        >
          Emit sample
        </button>
        <button type="button" onClick={() => void source.disconnect()}>
          Disconnect
        </button>
        <button
          type="button"
          onClick={() => source.emitError('Manual simulated source error')}
        >
          Emit error
        </button>
      </div>
    </aside>
  )
}
