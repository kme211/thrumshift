import { useId, useState } from 'react'

import { previewTrace } from '../../domain/puzzle/model'
import type {
  BehavioralReadings,
  PlayerSafeView,
  ValveId,
} from '../../domain/puzzle/types'

interface CoolantDeductionControlsProps {
  readonly view: PlayerSafeView
  readonly disabled: boolean
  readonly onValveChange: (valve: ValveId, position: string) => void
  readonly onTrace: (target: string) => void
  readonly onReset: () => void
}

const valves = ['V1', 'V2', 'V3'] as const

function readingsText(readings: BehavioralReadings): string {
  return Object.entries(readings)
    .map(([label, receiving]) => `${label}: ${receiving ? 'FLOW' : '—'}`)
    .join(' · ')
}

/** Only the allowlisted player projection crosses this presentation boundary. */
export function CoolantDeductionControls({
  view,
  disabled,
  onValveChange,
  onTrace,
  onReset,
}: CoolantDeductionControlsProps) {
  const id = useId()
  const [target, setTarget] = useState('A')
  const preview = previewTrace(view.schematic, view, target)
  const targetIds = view.schematic.candidateGroups.flatMap(
    (group) => group.fittings,
  )
  return (
    <section
      className="coolant-deduction"
      aria-label="Coolant deduction puzzle"
    >
      <h2>Coolant routing</h2>
      <p>
        Change valve positions and compare flow readings. Deliver coolant to the
        reactor.
      </p>
      <fieldset disabled={disabled} className="coolant-deduction__valves">
        <legend>Valve positions</legend>
        {valves.map((valve) => (
          <label key={valve}>
            {valve} position
            <select
              className="equipment-button"
              value={view.positions[valve]}
              onChange={(event) => onValveChange(valve, event.target.value)}
            >
              {Object.keys(view.schematic.valves[valve]).map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
      <div
        className="coolant-deduction__readings"
        role="group"
        aria-label="Flow readings"
      >
        {Object.entries(view.readings).map(([label, receiving]) => (
          <span key={label} data-flow={receiving}>
            {label}: {receiving ? 'FLOW' : 'NO FLOW'}
          </span>
        ))}
      </div>
      <details className="coolant-deduction__reference">
        <summary>Public routing reference</summary>
        <p>Connections are one-way. Untraced fittings remain concealed.</p>
        {valves.map((valve) => (
          <p key={valve}>
            {valve}:{' '}
            {Object.entries(view.schematic.valves[valve])
              .map(
                ([position, edges]) =>
                  `${position} (${edges.map(({ from, to }) => `${from} → ${to}`).join(', ')})`,
              )
              .join('; ')}
          </p>
        ))}
        {view.schematic.candidateGroups.map((group) => (
          <p key={group.fittings.join('')}>
            Fittings {group.fittings.join(' / ')} connect{' '}
            {group.first.join(' / ')} and {group.second.join(' / ')}.
          </p>
        ))}
      </details>
      <fieldset disabled={disabled} className="coolant-deduction__trace">
        <legend>Junction Trace</legend>
        <p>
          Trace charges: {view.chargesRemaining}/{view.traceBudget}
        </p>
        <label>
          Trace target
          <select
            className="equipment-button"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            {targetIds.map((fitting) => (
              <option key={fitting} value={fitting}>
                Fitting {fitting}
              </option>
            ))}
          </select>
        </label>
        <p id={`${id}-preview`}>
          {preview.status === 'available'
            ? `Reveal fitting ${target} and its direction. Cost: 1 trace charge.`
            : preview.status === 'known'
              ? `Fitting ${target} is already known. No charge spent.`
              : 'No trace charges remaining.'}
        </p>
        <button
          type="button"
          className="equipment-button"
          disabled={preview.status !== 'available'}
          aria-describedby={`${id}-preview`}
          onClick={() => onTrace(target)}
        >
          Junction Trace
        </button>
      </fieldset>
      <div aria-live="polite" className="coolant-deduction__discoveries">
        <h3>Discoveries</h3>
        {view.discoveries.length === 0 ? (
          <p>No fittings traced.</p>
        ) : (
          <ul>
            {view.discoveries.map(({ id, from, to }) => (
              <li key={id}>
                Fitting {id}: {from} → {to}
              </li>
            ))}
          </ul>
        )}
      </div>
      <details className="coolant-deduction__history" open>
        <summary>Experiment history ({view.observations.length})</summary>
        <ol tabIndex={0} aria-label="Experiment history">
          {view.observations.map((observation) => (
            <li key={observation.experiment}>
              <span>
                {observation.experiment}.{' '}
                {observation.action.type === 'VALVE CHANGE'
                  ? `${observation.action.valve} → ${observation.action.position}`
                  : observation.action.type}
              </span>
              <span>
                {Object.values(observation.positions).join(' / ')} ·{' '}
                {readingsText(observation.readings)}
              </span>
            </li>
          ))}
        </ol>
      </details>
      <p>
        Valve adjustments: {view.adjustments} · Junction Traces spent:{' '}
        {view.tracesSpent}
      </p>
      <button
        type="button"
        className="equipment-button"
        disabled={disabled}
        onClick={onReset}
      >
        Reset routing
      </button>
      <p className="coolant-deduction__note">
        Reset restores A / I / u. Discoveries, trace expenditure and experiment
        history are retained.
      </p>
    </section>
  )
}
