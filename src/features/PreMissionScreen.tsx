import { useEffect, useRef } from 'react'

import type {
  TelemetryCapability,
  TelemetrySourceStatus,
} from '../telemetry/HeartRateTelemetrySource'
import { TargetRangeFields } from './TargetRangeFields'

interface PreMissionScreenProps {
  readonly status: TelemetrySourceStatus
  readonly capability: TelemetryCapability
  readonly latestBpm: number | null
  readonly targetDraft: { readonly lower: string; readonly upper: string }
  readonly targetError: string | null
  readonly canBegin: boolean
  readonly showSourceSelector: boolean
  readonly selectedSource: 'simulated' | 'bluetooth'
  readonly onSelectSource: (source: 'simulated' | 'bluetooth') => void
  readonly onConnect: () => void
  readonly onTargetChange: (field: 'lower' | 'upper', value: string) => void
  readonly onTargetCommit: () => void
  readonly onBegin: () => void
}

export function PreMissionScreen(props: PreMissionScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])
  const unsupported = !props.capability.supported
  return (
    <section
      className="mx-auto max-w-3xl transition-colors duration-300"
      aria-labelledby="screen-heading"
    >
      <div className="border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
          Stay in range. Keep the station alive.
        </p>
        <p className="mt-3 text-lg font-bold">Thrumshift</p>
        <p className="mt-8 text-sm uppercase tracking-widest text-[var(--color-text-muted)]">
          Mission briefing
        </p>
        <h1
          ref={headingRef}
          id="screen-heading"
          tabIndex={-1}
          className="mt-2 text-3xl font-semibold sm:text-5xl"
        >
          Reactor Cooling Failure
        </h1>
        <p className="mt-3 max-w-prose leading-7 text-[var(--color-text-muted)]">
          Keep your movement steady while you restore the station’s cooling
          controls.
        </p>

        {props.showSourceSelector ? (
          <fieldset className="mt-6 flex flex-wrap gap-4">
            <legend className="font-semibold">
              Development telemetry source
            </legend>
            {(['simulated', 'bluetooth'] as const).map((source) => (
              <label key={source}>
                <input
                  type="radio"
                  name="product-source"
                  checked={props.selectedSource === source}
                  onChange={() => props.onSelectSource(source)}
                />{' '}
                {source === 'simulated' ? 'Simulator' : 'Web Bluetooth'}
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className="mt-6 border-l-4 border-[var(--color-accent)] pl-4">
          <h2 className="font-semibold">Operator bio-link</h2>
          <p className="mt-1">
            Connection: <strong>{props.status.state}</strong>
          </p>
          {props.status.state === 'error' ? (
            <p className="mt-1">{props.status.error.message}</p>
          ) : null}
          {unsupported ? (
            <p className="mt-2" role="status">
              {props.capability.reason === 'insecure-context'
                ? 'Web Bluetooth requires HTTPS or localhost.'
                : 'Web Bluetooth is unavailable in this browser. Use supported Chrome on Android.'}
            </p>
          ) : null}
          <output
            className="mt-3 block text-4xl font-bold"
            aria-label="Latest heart rate"
          >
            {props.latestBpm ?? '—'} <span className="text-base">BPM</span>
          </output>
          <button
            className="mt-4"
            type="button"
            disabled={unsupported || props.status.state === 'connecting'}
            onClick={props.onConnect}
          >
            {props.selectedSource === 'simulated'
              ? 'Connect simulator'
              : props.status.state === 'error'
                ? 'Retry heart-rate monitor'
                : 'Choose heart-rate monitor'}
          </button>
        </div>

        <TargetRangeFields
          lower={props.targetDraft.lower}
          upper={props.targetDraft.upper}
          error={props.targetError}
          onChange={props.onTargetChange}
          onCommit={props.onTargetCommit}
        />
        <p className="mt-5 text-sm text-[var(--color-text-muted)]">
          Thrumshift does not provide a medical target. Choose a comfortable
          gameplay range appropriate for you. Move safely in a clear area; stop
          if you feel unwell.
        </p>
        <button
          className="mt-6 w-full text-lg font-semibold"
          type="button"
          disabled={!props.canBegin}
          onClick={props.onBegin}
        >
          Begin Warm-Up
        </button>
      </div>
    </section>
  )
}
