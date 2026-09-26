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
    <p
      className="bio-link-status"
      aria-label="Bio-link status"
      data-link-state={connected ? 'connected' : transport.state}
    >
      <span className="bio-link-status__lamp" aria-hidden="true" />
      <span>
        <strong>Bio-link:</strong> {connected ? 'connected' : transport.state}
        <span className="bio-link-status__separator">; </span>
        <small>signal {signalQuality}</small>
      </span>
    </p>
  )
}
