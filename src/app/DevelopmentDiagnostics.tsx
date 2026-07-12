import type { AppEvent, AppState } from './AppState'
import type {
  ShellMissionState,
  ShellResult,
  ShellWarmupState,
} from './ShellState'
import { LifecycleDiagnostics } from './LifecycleDiagnostics'
import {
  TelemetryDiagnostics,
  type TelemetryDiagnosticsProps,
} from './TelemetryDiagnostics'

type State = AppState<ShellWarmupState, ShellMissionState, ShellResult>
type Event = AppEvent<ShellWarmupState, ShellMissionState, ShellResult>

interface DevelopmentDiagnosticsProps extends TelemetryDiagnosticsProps {
  readonly state: State
  readonly startWarmup: () => void
  readonly dispatch: (event: Event) => void
}

export function DevelopmentDiagnostics(props: DevelopmentDiagnosticsProps) {
  return (
    <aside
      className="mx-auto mt-6 max-w-3xl border border-dashed border-[var(--color-border)] p-4"
      aria-labelledby="development-diagnostics-heading"
    >
      <h2
        id="development-diagnostics-heading"
        className="text-lg font-semibold"
      >
        Development diagnostics
      </h2>
      <section className="mt-4" aria-labelledby="lifecycle-diagnostics-heading">
        <h3 id="lifecycle-diagnostics-heading" className="font-semibold">
          Lifecycle shells
        </h3>
        <div className="mt-3">
          <LifecycleDiagnostics
            state={props.state}
            startWarmup={props.startWarmup}
            dispatch={props.dispatch}
          />
        </div>
      </section>
      <TelemetryDiagnostics
        simulatedSource={props.simulatedSource}
        bluetoothSource={props.bluetoothSource}
      />
    </aside>
  )
}
