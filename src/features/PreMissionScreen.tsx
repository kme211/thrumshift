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
  const linkState = unsupported ? 'unavailable' : props.status.state
  return (
    <section
      className="pre-mission transition-colors duration-300"
      aria-labelledby="screen-heading"
    >
      <div className="equipment-shell pre-mission__shell">
        <div className="equipment-shell__fasteners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <header className="pre-mission__header">
          <div className="pre-mission__identity">
            <p className="equipment-kicker">
              <span>Thrumshift</span> / Station 04
            </p>
            <p className="mission-eyebrow">Mission briefing</p>
            <h1 ref={headingRef} id="screen-heading" tabIndex={-1}>
              Reactor Cooling Failure
            </h1>
            <p className="pre-mission__summary">
              Keep your movement steady while you restore the station’s cooling
              controls.
            </p>
          </div>
          <p className="pre-mission__motto">
            Stay in range. Keep the station alive.
          </p>
        </header>

        {props.showSourceSelector ? (
          <fieldset className="pre-mission__source-selector">
            <legend>Development telemetry source</legend>
            <div>
              {(['simulated', 'bluetooth'] as const).map((source) => (
                <label key={source}>
                  <input
                    type="radio"
                    name="product-source"
                    checked={props.selectedSource === source}
                    onChange={() => props.onSelectSource(source)}
                  />
                  <span>
                    {source === 'simulated' ? 'Simulator' : 'Web Bluetooth'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="pre-mission__console">
          <section
            className="equipment-module pre-mission__bio-link"
            aria-label="Operator bio-link"
          >
            <div className="equipment-label" aria-hidden="true">
              <span>Operator bio-link</span>
              <span>
                BL-01 / {linkState === 'connected' ? 'LINKED' : 'STANDBY'}
              </span>
            </div>
            <div className="crt-display crt-display--briefing">
              <div
                className="pre-mission__link-state"
                data-link-state={linkState}
              >
                <span className="bio-link-status__lamp" aria-hidden="true" />
                <p>
                  Connection: <strong>{linkState}</strong>
                </p>
              </div>
              {props.status.state === 'error' ? (
                <p className="pre-mission__link-message">
                  {props.status.error.message}
                </p>
              ) : null}
              {unsupported ? (
                <p className="pre-mission__link-message" role="status">
                  {props.capability.reason === 'insecure-context'
                    ? 'Web Bluetooth requires HTTPS or localhost.'
                    : 'Web Bluetooth is unavailable in this browser. Use supported Chrome on Android.'}
                </p>
              ) : null}
              <div className="pre-mission__bpm-readout">
                <span>Latest signal</span>
                <output aria-label="Latest heart rate">
                  {props.latestBpm ?? '—'} <small>BPM</small>
                </output>
              </div>
            </div>
            <button
              className="equipment-button pre-mission__connect"
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
          </section>

          <section
            className="equipment-module pre-mission__parameters"
            aria-label="Mission parameters"
          >
            <div className="equipment-label" aria-hidden="true">
              <span>Mission parameters</span>
              <span>RC-04 / PREP</span>
            </div>
            <div className="pre-mission__parameter-sheet">
              <TargetRangeFields
                lower={props.targetDraft.lower}
                upper={props.targetDraft.upper}
                error={props.targetError}
                variant="equipment"
                onChange={props.onTargetChange}
                onCommit={props.onTargetCommit}
              />
              <p className="pre-mission__safety-note">
                <strong>Operator advisory</strong>
                Thrumshift does not provide a medical target. Choose a
                comfortable gameplay range appropriate for you. Move safely in a
                clear area; stop if you feel unwell.
              </p>
            </div>
          </section>
        </div>

        <footer className="control-deck pre-mission__control-deck">
          <div className="control-deck__legend" aria-hidden="true">
            <span>MISSION COMMISSIONING</span>
            <strong>LOCAL AUTHORITY</strong>
          </div>
          <div
            className="control-deck__state pre-mission__ready-state"
            data-ready={props.canBegin}
            aria-hidden="true"
          >
            <span className="status-lamp" />
            {props.canBegin ? 'WARM-UP READY' : 'SETUP REQUIRED'}
          </div>
          <button
            className="equipment-button pre-mission__begin"
            type="button"
            disabled={!props.canBegin}
            onClick={props.onBegin}
          >
            Begin Warm-Up
          </button>
        </footer>
      </div>
    </section>
  )
}
