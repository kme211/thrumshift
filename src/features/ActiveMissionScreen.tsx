import { useEffect, useRef } from 'react'

import type { MissionRun } from '../app/MissionRun'
import { BioLinkStatus } from '../components/mission/BioLinkStatus'
import { ControlledCoolantPuzzle } from '../components/mission/CoolantPuzzle'
import { OperationalRangeGauge } from '../components/mission/OperationalRangeGauge'
import { StationStabilityMeter } from '../components/mission/StationStabilityMeter'
import { getMissionIntervalBehavior } from '../domain/mission/activeMission'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'

interface ActiveMissionScreenProps {
  readonly run: MissionRun
  readonly telemetryStatus: TelemetrySourceStatus
  readonly paused: boolean
  readonly hintEligible: boolean
  readonly hintRemainingMs: number
  readonly onRotate: (tileId: string) => void
  readonly onHint: () => void
  readonly onReset: () => void
  readonly onPause: () => void
  readonly onResume: () => void
}

export function ActiveMissionScreen(props: ActiveMissionScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const resumeRef = useRef<HTMLButtonElement>(null)
  const pauseRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const wasPaused = useRef(props.paused)
  const mission = props.run.session.mission

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (props.paused && dialog !== null) {
      if (typeof dialog.showModal === 'function' && !dialog.open)
        dialog.showModal()
      else dialog.setAttribute('open', '')
      resumeRef.current?.focus()
    } else if (wasPaused.current) pauseRef.current?.focus()
    wasPaused.current = props.paused
    return () => {
      if (dialog?.open && typeof dialog.close === 'function') dialog.close()
    }
  }, [props.paused])

  return (
    <main className="active-mission" aria-labelledby="active-mission-heading">
      <header className="active-mission__header">
        <div>
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

      <div className="active-mission__critical">
        <OperationalRangeGauge
          bpm={props.run.classifier.latestValidBpm}
          targetRange={props.run.session.targetRange}
          classification={props.run.classifier.stableClassification}
        />
        <StationStabilityMeter
          stability={mission.stability}
          behavior={getMissionIntervalBehavior(mission)}
        />
      </div>

      <p className="active-mission__instructions">
        Stay in range while restoring coolant flow. Correct low or high output,
        then rotate the route into place.
      </p>

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

      <button
        ref={pauseRef}
        className="mission-pause"
        type="button"
        onClick={props.onPause}
        disabled={props.paused}
      >
        Pause mission
      </button>

      {props.paused ? (
        <dialog
          ref={dialogRef}
          className="pause-dialog"
          aria-labelledby="pause-heading"
          aria-describedby="pause-description"
          onCancel={(event) => event.preventDefault()}
        >
          <p className="mission-eyebrow">Mission suspended</p>
          <h2 id="pause-heading">Mission paused</h2>
          <p id="pause-description">
            Mission time, station stability, classifications, and coolant
            controls are frozen.
          </p>
          <button ref={resumeRef} type="button" onClick={props.onResume}>
            Resume mission
          </button>
        </dialog>
      ) : null}
    </main>
  )
}
