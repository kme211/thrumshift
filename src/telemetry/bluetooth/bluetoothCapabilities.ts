import type { TelemetryCapability } from '../HeartRateTelemetrySource'
import type { BluetoothEnvironment } from './bluetoothPorts'

export function detectBluetoothCapability(
  environment: BluetoothEnvironment,
): TelemetryCapability {
  if (!environment.isSecureContext) {
    return { supported: false, reason: 'insecure-context' }
  }
  if (environment.bluetooth === undefined) {
    return { supported: false, reason: 'unsupported' }
  }
  return { supported: true }
}
