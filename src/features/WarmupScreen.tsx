import { useEffect, useRef } from 'react'

import { defaultGameplayTuning } from '../config/gameplayTuning'
import {
  getCountdownRemainingMs,
  getWarmupProgressMs,
} from '../domain/mission/warmup'
import type { WarmupSession } from '../app/WarmupSession'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'
import { rangeClassificationIndicator } from '../components/mission/rangeClassificationIndicator'
import { SegmentedIndicatorBank } from '../components/mission/SegmentedIndicatorBank'
import { TargetRangeFields } from './TargetRangeFields'

interface WarmupScreenProps {
  readonly session: WarmupSession
  readonly status: TelemetrySourceStatus
  readonly targetDraft: { readonly lower: string; readonly upper: string }
  readonly targetError: string | null
  readonly onConnect: () => void
  readonly onTargetChange: (field: 'lower' | 'upper', value: string) => void
  readonly onTargetCommit: () => void
  readonly onBack: () => void
}

function stableLabel(session: WarmupSession): string {
  const classifier = session.classifier
  if (classifier.signalQuality !== 'usable') return 'Unusable signal'
  if (classifier.stableClassification === null) return 'Pending — hold steady'
  if (classifier.stableClassification === 'below') return 'Below range'
  if (classifier.stableClassification === 'above') return 'Above range'
  return 'Operational'
}

function classificationHeadline(session: WarmupSession): string {
  const classifier = session.classifier
  if (classifier.signalQuality !== 'usable') return 'Acquisition pending'
  if (classifier.stableClassification === null) return 'Qualification pending'
  if (classifier.stableClassification === 'below') return 'Input below range'
  if (classifier.stableClassification === 'above') return 'Input above range'
  return 'Range lock established'
}

type IndicatorState = 'healthy' | 'warning' | 'critical' | 'inactive'

function classificationIndicator(session: WarmupSession): IndicatorState {
  if (session.classifier.signalQuality !== 'usable') return 'warning'
  if (
    session.classifier.stableClassification === 'below' ||
    session.classifier.stableClassification === 'above'
  )
    return 'critical'
  if (session.classifier.stableClassification === 'operational')
    return 'healthy'
  return 'warning'
}

function procedureMessage(session: WarmupSession): string {
  if (session.warmup.phase === 'countdown') return 'Transfer authorized'
  if (session.classifier.signalQuality !== 'usable') return 'Acquiring signal'
  if (session.classifier.stableClassification === null)
    return 'Stabilizing input'
  if (session.classifier.stableClassification !== 'operational')
    return 'Correct to range'
  return 'Hold operational'
}

export function WarmupScreen(props: WarmupScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusKey = props.session.warmup.phase
  useEffect(() => headingRef.current?.focus(), [focusKey])
  const { classifier, warmup, targetRange } = props.session
  const progress = getWarmupProgressMs(
    warmup,
    defaultGameplayTuning.warmup.qualificationMs,
  )
  const remaining = getCountdownRemainingMs(
    warmup,
    defaultGameplayTuning.countdown.durationMs,
  )
  const progressSeconds = Math.floor(progress / 1_000)
  const countdownSeconds =
    remaining === null ? null : Math.ceil(remaining / 1_000)
  const connected = props.status.state === 'connected'
  const hasSignal = classifier.latestValidBpm !== null
  const signalUsable = classifier.signalQuality === 'usable'
  const operational = classifier.stableClassification === 'operational'
  const countdown = warmup.phase === 'countdown'
  const classificationState = classificationIndicator(props.session)
  const procedureState = procedureMessage(props.session)
  return (
    <section
      className="warmup-sequence transition-colors duration-300"
      aria-labelledby="screen-heading"
      data-phase={countdown ? 'countdown' : 'warming'}
    >
      <div className="equipment-shell warmup-sequence__shell">
        <div className="equipment-shell__fasteners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <header className="warmup-sequence__header">
          <div className="warmup-sequence__identity">
            <p className="equipment-kicker">Thrumshift / Station 04</p>
            <p className="mission-eyebrow">Reactor Cooling Failure</p>
            <h1 ref={headingRef} id="screen-heading" tabIndex={-1}>
              {countdown ? 'Mission countdown' : 'Warm-up'}
            </h1>
          </div>
          <div className="warmup-sequence__status" aria-hidden="true">
            <span
              className="status-lamp"
              data-status={countdown ? 'healthy' : 'warning'}
            />
            <span>
              {countdown ? 'SEQUENCE ARMED' : 'COMMISSIONING'}
              <small>
                {countdown ? 'TRANSFER PENDING' : 'SIGNAL CHECK ACTIVE'}
              </small>
            </span>
          </div>
        </header>

        <div className="warmup-sequence__console">
          <section
            className="equipment-module warmup-sequence__telemetry"
            aria-label="Warm-up telemetry"
          >
            <div className="equipment-label" aria-hidden="true">
              <span>Operator bio-link</span>
              <span>BL-01 / {connected ? 'LINKED' : 'OPEN'}</span>
            </div>
            <div className="crt-display crt-display--warmup">
              <div
                className="warmup-sequence__link-state"
                data-state={connected ? 'connected' : 'disconnected'}
              >
                <span
                  className="status-lamp"
                  data-status={connected ? 'healthy' : 'critical'}
                  aria-hidden="true"
                />
                BIO-LINK {connected ? 'CONNECTED' : 'INTERRUPTED'}
              </div>
              <output
                className="warmup-sequence__bpm"
                aria-label="Latest heart rate"
              >
                <span>{classifier.latestValidBpm ?? '—'}</span>{' '}
                <small>BPM</small>
              </output>
              <p
                className="warmup-sequence__classification"
                data-state={classificationState}
              >
                <span aria-hidden="true">
                  {rangeClassificationIndicator(
                    classifier.stableClassification,
                  )}
                </span>{' '}
                <span
                  key={classificationHeadline(props.session)}
                  className="instrument-readout-transition"
                >
                  {classificationHeadline(props.session)}
                </span>
              </p>
              <p className="warmup-sequence__target">
                Target range: {targetRange.lowerBpm}–{targetRange.upperBpm} BPM
              </p>
              <div className="warmup-sequence__signal-detail">
                <p>
                  Signal quality: <strong>{classifier.signalQuality}</strong>
                </p>
                <p>
                  Stable gameplay status:{' '}
                  <strong>{stableLabel(props.session)}</strong>
                </p>
              </div>
              <p className="warmup-sequence__telemetry-note">
                Latest BPM updates immediately; gameplay status requires stable
                fresh evidence.
              </p>
            </div>
            {props.status.state !== 'connected' ? (
              <div className="warmup-sequence__reconnect">
                <p>
                  {props.status.state === 'error'
                    ? props.status.error.message
                    : 'Monitor disconnected. Warm-up progress was reset.'}
                </p>
                <button
                  className="equipment-button"
                  type="button"
                  onClick={props.onConnect}
                >
                  Reconnect monitor
                </button>
              </div>
            ) : null}
          </section>

          <section
            className="equipment-module warmup-sequence__procedure"
            aria-label="Station commissioning procedure"
          >
            <div className="equipment-label" aria-hidden="true">
              <span>Activation sequence</span>
              <span>AS-04 / {countdown ? 'TRANSFER' : 'QUALIFY'}</span>
            </div>
            <div
              className="crt-display crt-display--sequence"
              role={countdown ? 'status' : undefined}
            >
              <p className="warmup-sequence__procedure-kicker">
                {countdown
                  ? 'Qualification confirmed'
                  : 'Station commissioning'}
              </p>
              <p className="warmup-sequence__procedure-state">
                <span
                  key={procedureState}
                  className="instrument-readout-transition"
                >
                  {procedureState}
                </span>
              </p>
              {countdownSeconds === null ? (
                <div className="warmup-sequence__qualification">
                  <p>
                    Consecutive operational progress:{' '}
                    <strong>{progressSeconds} of 10 seconds</strong>
                  </p>
                  <progress
                    className="sr-only"
                    id="warmup-progress"
                    aria-label="Consecutive operational progress"
                    aria-valuetext={`${progressSeconds} of 10 qualifying seconds complete`}
                    max={defaultGameplayTuning.warmup.qualificationMs}
                    value={progress}
                  >
                    {progressSeconds} seconds
                  </progress>
                  <SegmentedIndicatorBank
                    className="warmup-sequence__qualification-bank"
                    litSegments={progressSeconds}
                    tone="healthy"
                  />
                  <p>
                    Hold a steady signal in the gameplay range to authorize
                    mission transfer.
                  </p>
                </div>
              ) : (
                <div className="warmup-sequence__countdown">
                  <output
                    key={countdownSeconds}
                    className="instrument-readout-transition"
                    aria-label="Seconds until mission activation"
                  >
                    {countdownSeconds}
                  </output>
                  <p>Seconds to mission transfer</p>
                  <small>
                    Keep the signal operational. Countdown cancels if
                    qualification is lost.
                  </small>
                </div>
              )}
            </div>

            <ol
              className="warmup-sequence__stages"
              aria-label="Readiness stages"
            >
              <li data-state={connected ? 'ready' : 'blocked'}>
                <span
                  className="status-lamp"
                  data-status={connected ? 'healthy' : 'critical'}
                  aria-hidden="true"
                />
                <span>
                  <strong>01 / Bio-link</strong>
                  {connected ? 'Connection established' : 'Connection open'}
                </span>
              </li>
              <li data-state={signalUsable ? 'ready' : 'active'}>
                <span
                  className="status-lamp"
                  data-status={signalUsable ? 'healthy' : 'warning'}
                  aria-hidden="true"
                />
                <span>
                  <strong>02 / Signal</strong>
                  {signalUsable
                    ? 'Telemetry usable'
                    : hasSignal
                      ? 'Evidence accumulating'
                      : 'Awaiting telemetry'}
                </span>
              </li>
              <li
                data-state={
                  countdown ? 'ready' : operational ? 'active' : 'idle'
                }
              >
                <span
                  className="status-lamp"
                  data-status={
                    countdown
                      ? 'healthy'
                      : operational
                        ? 'warning'
                        : classificationState === 'critical'
                          ? 'critical'
                          : 'inactive'
                  }
                  aria-hidden="true"
                />
                <span>
                  <strong>03 / Range lock</strong>
                  {countdown
                    ? 'Qualification secured'
                    : operational
                      ? `Operational hold ${progressSeconds}/10`
                      : 'Lock not established'}
                </span>
              </li>
            </ol>

            <div className="warmup-sequence__parameters">
              <TargetRangeFields
                lower={props.targetDraft.lower}
                upper={props.targetDraft.upper}
                error={props.targetError}
                variant="equipment"
                onChange={props.onTargetChange}
                onCommit={props.onTargetCommit}
              />
            </div>
          </section>
        </div>

        <footer className="control-deck warmup-sequence__control-deck">
          <div className="control-deck__legend" aria-hidden="true">
            <span>MISSION COMMISSIONING</span>
            <strong>LOCAL AUTHORITY</strong>
          </div>
          <div className="control-deck__state" aria-hidden="true">
            <span
              className="status-lamp"
              data-status={
                countdown ? 'healthy' : operational ? 'warning' : 'inactive'
              }
            />
            {countdown
              ? 'TRANSFER COMMITTED'
              : operational
                ? 'QUALIFICATION IN PROGRESS'
                : 'SIGNAL ACQUISITION'}
          </div>
          <button
            className="equipment-button equipment-button--secondary warmup-sequence__back"
            type="button"
            onClick={props.onBack}
          >
            Back to briefing
          </button>
        </footer>
      </div>
    </section>
  )
}
