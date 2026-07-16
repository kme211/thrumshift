import type { StabilityTuning } from '../../config/gameplayTuning'
import type { RangeClassification } from '../heart-rate/classifier'

export interface StabilityIntegration {
  readonly stability: number
  readonly failureOffsetMs: number | null
  readonly maximumOffsetMs: number | null
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Projects a complete classified segment analytically from its canonical
 * anchor. The rate is constant between behavior-changing facts, so long
 * intervals need no lossy cap or iterative subdivision.
 */
export function integrateStability(
  stability: number,
  classification: RangeClassification,
  elapsedMs: number,
  tuning: StabilityTuning,
): StabilityIntegration {
  const ratePerSecond =
    classification === 'below'
      ? -tuning.belowDrainPerSecond
      : classification === 'above'
        ? -tuning.aboveDrainPerSecond
        : tuning.operationalRecoveryPerSecond
  const unbounded = stability + (ratePerSecond * elapsedMs) / 1_000
  const failureOffsetMs =
    ratePerSecond < 0 && unbounded <= tuning.minimum
      ? ((stability - tuning.minimum) * 1_000) / -ratePerSecond
      : null
  const maximumOffsetMs =
    ratePerSecond > 0 && unbounded >= tuning.maximum
      ? ((tuning.maximum - stability) * 1_000) / ratePerSecond
      : null
  return {
    stability: clamp(unbounded, tuning.minimum, tuning.maximum),
    failureOffsetMs,
    maximumOffsetMs,
  }
}
