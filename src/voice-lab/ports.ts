import { getBrowserMonotonicClock } from '../platform/Clock'
import {
  getBrowserScreenWakeLock,
  type ScreenWakeLock,
} from '../platform/ScreenWakeLock'
import type { HeartRateTelemetrySource } from '../telemetry/HeartRateTelemetrySource'
import { getBrowserBluetoothEnvironment } from '../telemetry/bluetooth/bluetoothPorts'
import { WebBluetoothHeartRateSource } from '../telemetry/bluetooth/WebBluetoothHeartRateSource'
import { browserPresentation, type VoicePresentation } from './presentation'
import { browserRecognitionFactory, SpeechAdapter } from './speech'

export interface LabPorts {
  hr: HeartRateTelemetrySource
  wake: ScreenWakeLock
  speech: SpeechAdapter
  voice: VoicePresentation
}
export function createBrowserLabPorts(): LabPorts {
  return {
    hr: new WebBluetoothHeartRateSource(
      getBrowserBluetoothEnvironment(),
      getBrowserMonotonicClock(),
    ),
    wake: getBrowserScreenWakeLock(),
    speech: new SpeechAdapter(browserRecognitionFactory()),
    voice: browserPresentation(),
  }
}
