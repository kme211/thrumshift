import { WebBluetoothHeartRateSource } from '../telemetry/bluetooth/WebBluetoothHeartRateSource'
import { getBrowserBluetoothEnvironment } from '../telemetry/bluetooth/bluetoothPorts'
import { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
import { getBrowserMonotonicClock } from '../platform/Clock'
import { getBrowserPageVisibility } from '../platform/PageVisibility'
import { getBrowserScreenWakeLock } from '../platform/ScreenWakeLock'
import { AppFlow } from './AppFlow'

const clock = getBrowserMonotonicClock()
const visibility = getBrowserPageVisibility(clock)
const wakeLock = getBrowserScreenWakeLock()

const developmentTelemetrySources = import.meta.env.DEV
  ? {
      simulatedSource: new SimulatedHeartRateSource({
        now: () => clock.now(),
      }),
      bluetoothSource: new WebBluetoothHeartRateSource(
        getBrowserBluetoothEnvironment(),
        {
          now: () => clock.now(),
        },
      ),
    }
  : null

export function App() {
  return (
    <main className="min-h-dvh pt-[max(var(--space-page),env(safe-area-inset-top))] pr-[max(var(--space-page),env(safe-area-inset-right))] pb-[max(var(--space-page),env(safe-area-inset-bottom))] pl-[max(var(--space-page),env(safe-area-inset-left))] sm:pt-[max(3rem,env(safe-area-inset-top))] sm:pr-[max(2.5rem,env(safe-area-inset-right))] sm:pb-[max(3rem,env(safe-area-inset-bottom))] sm:pl-[max(2.5rem,env(safe-area-inset-left))]">
      <AppFlow
        visibility={visibility}
        wakeLock={wakeLock}
        diagnostics={developmentTelemetrySources}
      />
    </main>
  )
}
