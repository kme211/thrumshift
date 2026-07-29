import type { SignalQuality } from '../../domain/heart-rate/classifier'
import type { TelemetrySourceStatus } from '../../telemetry/HeartRateTelemetrySource'

export function BioLinkStatus({
  transport,
  signalQuality,
}: {
  readonly transport: TelemetrySourceStatus
  readonly signalQuality: SignalQuality
}) {
  const connected = transport.state === 'connected'
  return (
    <p className="bio-link-status" aria-label="Bio-link status">
      <span aria-hidden="true">{connected ? '●' : '○'}</span> Bio-link:{' '}
      {connected ? 'connected' : transport.state}; signal {signalQuality}
    </p>
  )
}
