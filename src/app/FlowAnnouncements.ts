import { getMissionIntervalBehavior } from '../domain/mission/activeMission'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'
import type { MissionRun } from './MissionRun'

export interface FlowAnnouncementTuning {
  readonly stabilityMinimum: number
  readonly stabilityMaximum: number
}

function stabilityTrend(
  run: MissionRun,
  tuning: FlowAnnouncementTuning,
): string {
  const behavior = getMissionIntervalBehavior(run.session.mission)
  if (behavior === 'activeBelowRange' || behavior === 'activeAboveRange') {
    return 'decreasing'
  }
  if (
    behavior === 'activeOperational' &&
    run.session.mission.stability < tuning.stabilityMaximum
  ) {
    return 'recovering'
  }
  if (behavior === 'suspended') return 'paused'
  return 'holding'
}

export function announcementForActiveRunTransition(
  before: MissionRun,
  after: MissionRun,
  fallback: string,
  tuning: FlowAnnouncementTuning,
): string {
  const announcements: string[] = []
  const previousClassification = before.classifier.stableClassification
  const currentClassification = after.classifier.stableClassification
  if (previousClassification !== currentClassification) {
    if (currentClassification === 'below') {
      announcements.push('Heart rate is below range')
    }
    if (currentClassification === 'operational') {
      announcements.push('Heart rate is operational')
    }
    if (currentClassification === 'above') {
      announcements.push('Heart rate is above range')
    }
    if (currentClassification === null) {
      announcements.push('Stable heart-rate classification unavailable')
    }
  }

  const previousTrend = stabilityTrend(before, tuning)
  const currentTrend = stabilityTrend(after, tuning)
  if (previousTrend !== currentTrend && currentTrend !== 'paused') {
    announcements.push(`Station stability is ${currentTrend}`)
  }

  const previous = before.session.mission.stability
  const current = after.session.mission.stability
  const stabilityRange = tuning.stabilityMaximum - tuning.stabilityMinimum
  for (const { fraction, percentage } of [
    { fraction: 0.75, percentage: 75 },
    { fraction: 0.5, percentage: 50 },
    { fraction: 0.25, percentage: 25 },
  ]) {
    const threshold = tuning.stabilityMinimum + stabilityRange * fraction
    if (previous > threshold && current <= threshold) {
      announcements.push(
        percentage === 75
          ? 'Station stability warning: 75 percent'
          : `Station stability critical: ${percentage} percent`,
      )
    }
  }
  return announcements.length === 0 ? fallback : announcements.join('. ')
}

export function announcementForTelemetryStatus(
  status: TelemetrySourceStatus,
): string {
  if (status.state === 'connected') return 'Heart-rate monitor connected'
  if (status.state === 'connecting') return 'Connecting to heart-rate monitor'
  if (status.state === 'disconnected') return 'Heart-rate monitor disconnected'
  return status.error.message
}
