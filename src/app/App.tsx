import { WebBluetoothHeartRateSource } from '../telemetry/bluetooth/WebBluetoothHeartRateSource'
import { getBrowserBluetoothEnvironment } from '../telemetry/bluetooth/bluetoothPorts'
import { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
import { TelemetryDiagnostics } from './TelemetryDiagnostics'

const developmentTelemetrySources = import.meta.env.DEV
  ? {
      simulated: new SimulatedHeartRateSource({ now: () => performance.now() }),
      bluetooth: new WebBluetoothHeartRateSource(
        getBrowserBluetoothEnvironment(),
        {
          now: () => performance.now(),
        },
      ),
    }
  : null

export function App() {
  return (
    <main className="min-h-dvh pt-[max(var(--space-page),env(safe-area-inset-top))] pr-[max(var(--space-page),env(safe-area-inset-right))] pb-[max(var(--space-page),env(safe-area-inset-bottom))] pl-[max(var(--space-page),env(safe-area-inset-left))] sm:pt-[max(3rem,env(safe-area-inset-top))] sm:pr-[max(2.5rem,env(safe-area-inset-right))] sm:pb-[max(3rem,env(safe-area-inset-bottom))] sm:pl-[max(2.5rem,env(safe-area-inset-left))]">
      <section
        className="mx-auto flex min-h-[calc(100dvh-(2*var(--space-page)))] max-w-3xl items-center transition-colors duration-300"
        aria-labelledby="product-name"
      >
        <div className="w-full border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Stay in range. Keep the station alive.
          </p>
          <h1
            id="product-name"
            className="mt-3 text-4xl font-bold tracking-tight sm:text-6xl"
          >
            Thrumshift
          </h1>

          <div className="mt-10 border-l-4 border-[var(--color-accent)] pl-5 sm:mt-14">
            <p className="text-sm uppercase tracking-widest text-[var(--color-text-muted)]">
              Mission placeholder
            </p>
            <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">
              Reactor Cooling Failure
            </h2>
            <p className="mt-3 max-w-prose text-base leading-7 text-[var(--color-text-muted)] sm:text-lg">
              Operator systems are being prepared. Mission controls will arrive
              in a later phase.
            </p>
          </div>
        </div>
      </section>
      {developmentTelemetrySources === null ? null : (
        <TelemetryDiagnostics
          simulatedSource={developmentTelemetrySources.simulated}
          bluetoothSource={developmentTelemetrySources.bluetooth}
        />
      )}
    </main>
  )
}
