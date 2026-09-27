import { useEffect, useRef } from 'react'

import type { TelemetryCapability } from '../telemetry/HeartRateTelemetrySource'

interface LaunchScreenProps {
  readonly bluetoothCapability: TelemetryCapability
  readonly onRunSimulation: () => void
  readonly onConnectBioLink: () => void
}

function bluetoothRequirement(capability: TelemetryCapability): string {
  if (capability.supported) {
    return 'Compatible Bluetooth heart-rate monitor required.'
  }
  if (capability.reason === 'insecure-context') {
    return 'Bio-link unavailable here. Web Bluetooth requires HTTPS or localhost.'
  }
  return 'Bio-link unavailable in this browser. Use a compatible Chromium browser, such as Chrome on Android.'
}

export function LaunchScreen({
  bluetoothCapability,
  onRunSimulation,
  onConnectBioLink,
}: LaunchScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])
  const bluetoothAvailable = bluetoothCapability.supported

  return (
    <section className="launch-screen" aria-labelledby="launch-heading">
      <div className="equipment-shell launch-screen__shell">
        <div className="equipment-shell__fasteners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <header className="launch-screen__header">
          <div className="launch-screen__identity">
            <p className="equipment-kicker">Thrumshift / Station 04</p>
            <p className="mission-eyebrow">Station access console</p>
          </div>
          <div className="launch-screen__status" aria-hidden="true">
            <span className="status-lamp" data-status="warning" />
            <span>
              ACCESS READY
              <small>INPUT NOT SELECTED</small>
            </span>
          </div>
        </header>

        <div className="launch-screen__console">
          <section
            className="equipment-module launch-screen__briefing"
            aria-label="Station directive"
          >
            <div className="equipment-label" aria-hidden="true">
              <span>Mission directive</span>
              <span>TS-04 / STANDBY</span>
            </div>
            <div className="crt-display crt-display--launch">
              <p className="launch-screen__display-kicker">
                Reactor coolant intervention
              </p>
              <h1 ref={headingRef} id="launch-heading" tabIndex={-1}>
                Stay in range. Keep the station alive.
              </h1>
              <p className="launch-screen__summary">
                Heart-rate telemetry drives station stability while you restore
                coolant flow through a failing reactor system.
              </p>
              <div className="launch-screen__signal-line" aria-hidden="true">
                <span>HEART RATE</span>
                <span>STABILITY</span>
                <span>COOLANT ROUTE</span>
              </div>
            </div>
          </section>

          <section
            className="equipment-module launch-screen__access"
            aria-labelledby="access-heading"
          >
            <div className="equipment-label" aria-hidden="true">
              <span>Telemetry access</span>
              <span>TA-04 / SELECT</span>
            </div>
            <div className="launch-screen__access-panel">
              <h2 id="access-heading" className="sr-only">
                Choose telemetry access
              </h2>

              <div className="launch-screen__channel">
                <div className="launch-screen__channel-state">
                  <span
                    className="status-lamp"
                    data-status="healthy"
                    aria-hidden="true"
                  />
                  <span>
                    SIM-04
                    <small>TRAINING SIGNAL READY</small>
                  </span>
                </div>
                <p>
                  No monitor required. Runs a stable 110 BPM training signal.
                </p>
                <button
                  className="equipment-button launch-screen__action"
                  type="button"
                  onClick={onRunSimulation}
                >
                  Run Simulation
                </button>
              </div>

              <div className="launch-screen__channel">
                <div className="launch-screen__channel-state">
                  <span
                    className="status-lamp"
                    data-status={bluetoothAvailable ? 'warning' : 'critical'}
                    aria-hidden="true"
                  />
                  <span>
                    BL-01
                    <small>
                      {bluetoothAvailable ? 'BIO-LINK STANDBY' : 'UNAVAILABLE'}
                    </small>
                  </span>
                </div>
                <p id="bluetooth-requirement">
                  {bluetoothRequirement(bluetoothCapability)}
                </p>
                <button
                  className="equipment-button equipment-button--secondary launch-screen__action"
                  type="button"
                  disabled={!bluetoothAvailable}
                  aria-describedby="bluetooth-requirement"
                  onClick={onConnectBioLink}
                >
                  Connect Bio-Link
                </button>
              </div>
            </div>
          </section>
        </div>

        <footer className="control-deck launch-screen__control-deck">
          <div className="control-deck__legend" aria-hidden="true">
            <span>STATION ACCESS</span>
            <strong>LOCAL AUTHORITY</strong>
          </div>
          <div className="control-deck__state" aria-hidden="true">
            <span className="status-lamp" data-status="inactive" />
            SELECT INPUT SOURCE
          </div>
          <a
            className="launch-screen__attribution"
            href="https://kearieggers.com"
            target="_blank"
            rel="noreferrer"
          >
            Built by Keari Eggers
          </a>
        </footer>
      </div>
    </section>
  )
}
