const SIMULATOR_PRESETS = [
  { label: 'Low', bpm: 90 },
  { label: 'In range', bpm: 110 },
  { label: 'High', bpm: 160 },
] as const

interface SimulatorOutputControlProps {
  readonly bpm: number
  readonly onSelect: (bpm: number) => void
}

export function SimulatorOutputControl({
  bpm,
  onSelect,
}: SimulatorOutputControlProps) {
  return (
    <fieldset className="simulator-output">
      <legend className="sr-only">Simulator heart-rate output</legend>
      <div className="simulator-output__label" aria-hidden="true">
        <span>SIM-04 Output Control</span>
        <span>Training signal</span>
      </div>
      <div className="simulator-output__panel">
        <div className="simulator-output__readout">
          <span>Current output</span>
          <output aria-label="Current simulated heart rate">
            {bpm} <small>BPM</small>
          </output>
        </div>
        <div className="simulator-output__presets">
          {SIMULATOR_PRESETS.map((preset) => {
            const selected = bpm === preset.bpm
            return (
              <button
                key={preset.bpm}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(preset.bpm)}
              >
                <span
                  className="status-lamp"
                  data-status={selected ? 'healthy' : 'inactive'}
                  aria-hidden="true"
                />
                <span>
                  <strong>{preset.label}</strong>
                  <small>{preset.bpm} BPM</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </fieldset>
  )
}
