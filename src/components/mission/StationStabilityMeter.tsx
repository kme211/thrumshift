import type { MissionIntervalBehavior } from '../../domain/mission/activeMission'

function stabilityTrend(
  behavior: MissionIntervalBehavior,
  stability: number,
): string {
  if (behavior === 'activeBelowRange' || behavior === 'activeAboveRange')
    return 'decreasing'
  if (behavior === 'activeOperational' && stability < 100) return 'recovering'
  if (behavior === 'suspended') return 'paused'
  return 'holding'
}

function accessibleStabilitySnapshot(stability: number): number {
  return Math.max(0, Math.min(100, Math.round(stability / 10) * 10))
}

export function StationStabilityMeter({
  stability,
  behavior,
}: {
  readonly stability: number
  readonly behavior: MissionIntervalBehavior
}) {
  const rounded = Math.round(stability)
  const accessibleSnapshot = accessibleStabilitySnapshot(stability)
  const trend = stabilityTrend(behavior, stability)
  return (
    <section
      className="station-stability"
      aria-labelledby="stability-heading"
      data-trend={trend}
    >
      <div className="station-stability__label">
        <h2 id="stability-heading">Station stability</h2>
        <span className="station-stability__value" aria-hidden="true">
          {rounded}%
        </span>
      </div>
      <div
        className="station-stability__track"
        role="meter"
        aria-label="Station stability"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={accessibleSnapshot}
        aria-valuetext={`Approximately ${accessibleSnapshot} percent, ${trend}`}
      >
        <span style={{ width: `${rounded}%` }} />
      </div>
      <p className="station-stability__trend">Trend: {trend}</p>
    </section>
  )
}
