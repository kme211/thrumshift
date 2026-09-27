import { useEffect, useRef } from 'react'

import type { MissionRun } from '../app/MissionRun'
import { BioLinkStatus } from '../components/mission/BioLinkStatus'
import { ControlledCoolantPuzzle } from '../components/mission/CoolantPuzzle'
import { OperationalRangeGauge } from '../components/mission/OperationalRangeGauge'
import { StationStabilityMeter } from '../components/mission/StationStabilityMeter'
import { getMissionIntervalBehavior } from '../domain/mission/activeMission'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'
import type { SuspensionReason } from '../app/AppState'

interface ActiveMissionScreenProps {
  readonly run: MissionRun
  readonly telemetryStatus: TelemetrySourceStatus
  readonly paused: boolean
  readonly suspensionReasons: readonly SuspensionReason[]
  readonly pageVisible: boolean
  readonly canResume: boolean
  readonly hintEligible: boolean
  readonly hintRemainingMs: number
  readonly onRotate: (tileId: string) => void
  readonly onHint: () => void
  readonly onReset: () => void
  readonly onPause: () => void
  readonly onResume: () => void
  readonly onReconnect: () => void
  readonly onEndRun: () => void
}

export function ActiveMissionScreen(props: ActiveMissionScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const interruptionHeadingRef = useRef<HTMLHeadingElement>(null)
  const resumeRef = useRef<HTMLButtonElement>(null)
  const reconnectRef = useRef<HTMLButtonElement>(null)
  const pauseRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const wasPaused = useRef(false)
  const wasPageVisible = useRef(props.pageVisible)
  const previousSuspensionReasons = useRef<readonly SuspensionReason[]>([])
  const reconnectHadFocus = useRef(false)
  const mission = props.run.session.mission

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    const newlyPaused = props.paused && !wasPaused.current
    const newlyVisible = props.pageVisible && !wasPageVisible.current
    const disconnectCleared =
      previousSuspensionReasons.current.includes('disconnect') &&
      !props.suspensionReasons.includes('disconnect')
    if (props.paused && props.pageVisible && dialog !== null) {
      if (typeof dialog.showModal === 'function' && !dialog.open)
        dialog.showModal()
      else dialog.setAttribute('open', '')
      if (newlyPaused || newlyVisible) {
        if (props.suspensionReasons.includes('disconnect')) {
          reconnectRef.current?.focus()
        } else if (props.suspensionReasons.includes('manual')) {
          resumeRef.current?.focus()
        } else {
          interruptionHeadingRef.current?.focus()
        }
      } else if (disconnectCleared && reconnectHadFocus.current) {
        reconnectHadFocus.current = false
        if (props.canResume) resumeRef.current?.focus()
        else interruptionHeadingRef.current?.focus()
      }
    } else if (wasPaused.current) pauseRef.current?.focus()
    wasPaused.current = props.paused
    wasPageVisible.current = props.pageVisible
    previousSuspensionReasons.current = props.suspensionReasons
  }, [
    props.canResume,
    props.pageVisible,
    props.paused,
    props.suspensionReasons,
  ])

  useEffect(
    () => () => {
      const dialog = dialogRef.current
      if (dialog?.open && typeof dialog.close === 'function') dialog.close()
    },
    [],
  )

  const disconnected = props.suspensionReasons.includes('disconnect')
  const telemetryError =
    props.telemetryStatus.state === 'error'
      ? props.telemetryStatus.error.message
      : null
  const visibleReasons = props.suspensionReasons.filter(
    (reason) => reason !== 'resumeRequired',
  )
  const interruptionKind = disconnected ? 'disconnect' : 'hold'
  const missionBehavior = getMissionIntervalBehavior(mission)
  const missionCondition =
    missionBehavior === 'activeBelowRange' ||
    missionBehavior === 'activeAboveRange'
      ? 'degrading'
      : missionBehavior === 'activeOperational' && mission.stability < 100
        ? 'recovering'
        : 'stable'
  const resumeStatus = props.canResume
    ? 'Signal stable. Resume available.'
    : 'Waiting for a fresh, stable heart-rate signal.'
  const reasonText: Record<SuspensionReason, string> = {
    manual: 'You paused the mission.',
    resumeRequired: 'Your confirmation is required before play continues.',
    hidden: 'The page was hidden. Mission time stopped immediately.',
    disconnect: 'The heart-rate monitor disconnected.',
    staleSignal: 'No fresh heart-rate signal is available.',
  }

  return (
    <main className="active-mission" aria-labelledby="active-mission-heading">
      <div className="equipment-shell active-mission__shell">
        <div className="equipment-shell__fasteners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <header className="active-mission__header">
          <div className="active-mission__identity">
            <p className="equipment-kicker">THRUMSHIFT / STATION 04</p>
            <p className="mission-eyebrow">Active mission</p>
            <h1 ref={headingRef} tabIndex={-1} id="active-mission-heading">
              Reactor Cooling Failure
            </h1>
          </div>
          <BioLinkStatus
            transport={props.telemetryStatus}
            signalQuality={props.run.classifier.signalQuality}
          />
        </header>

        <div className="active-mission__console">
          <section
            className="equipment-module active-mission__telemetry"
            aria-label="Mission telemetry"
          >
            <div className="equipment-label" aria-hidden="true">
              <span>Biometric regulator</span>
              <span>BR-110 / LIVE</span>
            </div>
            <div className="crt-display crt-display--telemetry">
              <div className="active-mission__critical">
                <OperationalRangeGauge
                  bpm={props.run.classifier.latestValidBpm}
                  targetRange={props.run.session.targetRange}
                  classification={props.run.classifier.stableClassification}
                />
                <StationStabilityMeter
                  stability={mission.stability}
                  behavior={missionBehavior}
                />
              </div>
            </div>
            <p className="active-mission__instructions">
              Stay in range while restoring coolant flow. Correct low or high
              output, then rotate the route into place.
            </p>
          </section>

          <section
            className="equipment-module active-mission__routing"
            aria-label="Coolant routing controls"
          >
            <div className="equipment-label" aria-hidden="true">
              <span>Coolant route matrix</span>
              <span>CR-03 / LOCAL</span>
            </div>
            <div className="crt-display crt-display--schematic">
              <ControlledCoolantPuzzle
                puzzle={props.run.puzzle}
                hint={props.run.hint}
                rotationCounts={props.run.puzzleRotationCounts}
                disabled={props.paused || mission.status.phase === 'finalized'}
                complete={props.run.session.statistics.puzzleCompleted}
                hintEligible={props.hintEligible}
                hintRemainingMs={props.hintRemainingMs}
                onRotate={props.onRotate}
                onHint={props.onHint}
                onReset={props.onReset}
              />
            </div>
          </section>
        </div>

        <footer className="control-deck">
          <div className="control-deck__legend" aria-hidden="true">
            <span>OPERATOR CONTROL BUS</span>
            <strong>LOCAL AUTHORITY</strong>
          </div>
          <div className="control-deck__state" aria-hidden="true">
            <span
              className="status-lamp"
              data-status={
                missionCondition === 'degrading'
                  ? 'critical'
                  : missionCondition === 'recovering'
                    ? 'warning'
                    : 'healthy'
              }
            />
            {missionCondition === 'degrading'
              ? 'STABILITY DEGRADING'
              : missionCondition === 'recovering'
                ? 'STABILITY RECOVERING'
                : 'MISSION ACTIVE'}
          </div>
          <button
            ref={pauseRef}
            className="equipment-button mission-pause"
            type="button"
            onClick={props.onPause}
            disabled={props.paused}
          >
            Pause mission
          </button>
        </footer>
      </div>

      {props.paused ? (
        <dialog
          ref={dialogRef}
          className="pause-dialog interruption-dialog"
          data-interruption-kind={interruptionKind}
          aria-labelledby="pause-heading"
          aria-describedby="pause-description"
          onCancel={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return
            const dialog = dialogRef.current
            if (dialog === null) return
            const controls = [...dialog.querySelectorAll('button')].filter(
              (button) => !button.disabled,
            )
            const first = controls[0]
            const last = controls.at(-1)
            if (
              event.shiftKey &&
              document.activeElement === first &&
              last !== undefined
            ) {
              event.preventDefault()
              last.focus()
            } else if (
              !event.shiftKey &&
              document.activeElement === last &&
              first !== undefined
            ) {
              event.preventDefault()
              first.focus()
            }
          }}
        >
          <div
            className="equipment-label interruption-dialog__label"
            aria-hidden="true"
          >
            <span>Mission control interlock</span>
            <span>MI-04 / {disconnected ? 'LINK OPEN' : 'OPERATOR HOLD'}</span>
          </div>

          <div className="crt-display crt-display--interruption">
            <div className="interruption-dialog__signal" aria-hidden="true">
              <span
                className="status-lamp"
                data-status={disconnected ? 'critical' : 'warning'}
              />
              {disconnected ? 'BIO-LINK INTERRUPTED' : 'HOLD ENGAGED'}
            </div>
            <p className="mission-eyebrow">Mission suspended</p>
            <h2
              ref={interruptionHeadingRef}
              tabIndex={-1}
              id="pause-heading"
              onFocus={() => {
                reconnectHadFocus.current = false
              }}
            >
              Mission paused
            </h2>
            <p id="pause-description" className="interruption-dialog__summary">
              Mission time, station stability, classifications, and coolant
              controls are frozen.
            </p>
            <ul className="interruption-dialog__reasons">
              {visibleReasons.map((reason) => (
                <li key={reason} data-reason={reason}>
                  {reasonText[reason]}
                </li>
              ))}
            </ul>
            {visibleReasons.length === 0 ? (
              <p className="interruption-dialog__reason-fallback">
                {reasonText.resumeRequired}
              </p>
            ) : null}
            {!disconnected || telemetryError === null ? null : (
              <p id="reconnect-error" className="interruption-dialog__status">
                {telemetryError}
              </p>
            )}
          </div>

          <div className="interruption-dialog__controls">
            {disconnected ? (
              <button
                ref={reconnectRef}
                className="equipment-button interruption-dialog__action interruption-dialog__action--primary"
                type="button"
                aria-describedby={
                  telemetryError === null ? undefined : 'reconnect-error'
                }
                onFocus={() => {
                  reconnectHadFocus.current = true
                }}
                onClick={props.onReconnect}
              >
                Reconnect monitor
              </button>
            ) : null}
            <button
              ref={resumeRef}
              className={`equipment-button interruption-dialog__action ${
                disconnected
                  ? 'interruption-dialog__action--resume'
                  : 'interruption-dialog__action--primary'
              }`}
              type="button"
              aria-disabled={!props.canResume}
              onFocus={() => {
                reconnectHadFocus.current = false
              }}
              onClick={() => {
                if (props.canResume) props.onResume()
              }}
            >
              Resume mission
            </button>
            <button
              className="equipment-button interruption-dialog__action interruption-dialog__action--end"
              type="button"
              onFocus={() => {
                reconnectHadFocus.current = false
              }}
              onClick={props.onEndRun}
            >
              End run
            </button>
            <p className="interruption-dialog__status">{resumeStatus}</p>
          </div>
        </dialog>
      ) : null}
    </main>
  )
}
