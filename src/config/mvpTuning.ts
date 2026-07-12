export interface MvpTuning {
  readonly heartRate: {
    readonly plausibleBpm: {
      readonly minimum: number
      readonly maximum: number
    }
    readonly rollingWindowMs: number
    readonly rollingSampleLimit: number
    readonly minimumSamplesInWindow: number
    readonly staleAfterMs: number
    readonly hysteresisBpm: number
    readonly classificationDwellMs: number
  }
  readonly warmup: {
    readonly qualificationMs: number
    readonly countdownMs: number
  }
}

export const defaultMvpTuning: MvpTuning = {
  heartRate: {
    plausibleBpm: { minimum: 30, maximum: 240 },
    rollingWindowMs: 3_000,
    rollingSampleLimit: 5,
    minimumSamplesInWindow: 3,
    staleAfterMs: 3_000,
    hysteresisBpm: 3,
    classificationDwellMs: 2_000,
  },
  warmup: { qualificationMs: 10_000, countdownMs: 3_000 },
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`)
  }
}

/** Validates configuration once at the composition boundary, never in a timer. */
export function validateMvpTuning(tuning: MvpTuning): MvpTuning {
  const { heartRate, warmup } = tuning
  positiveInteger(heartRate.plausibleBpm.minimum, 'plausibleBpm.minimum')
  positiveInteger(heartRate.plausibleBpm.maximum, 'plausibleBpm.maximum')
  if (heartRate.plausibleBpm.minimum >= heartRate.plausibleBpm.maximum) {
    throw new RangeError('plausibleBpm.minimum must be below maximum')
  }
  positiveInteger(heartRate.rollingWindowMs, 'rollingWindowMs')
  positiveInteger(heartRate.rollingSampleLimit, 'rollingSampleLimit')
  positiveInteger(heartRate.minimumSamplesInWindow, 'minimumSamplesInWindow')
  if (heartRate.minimumSamplesInWindow > heartRate.rollingSampleLimit) {
    throw new RangeError(
      'minimumSamplesInWindow must not exceed rollingSampleLimit',
    )
  }
  positiveInteger(heartRate.staleAfterMs, 'staleAfterMs')
  positiveInteger(heartRate.hysteresisBpm, 'hysteresisBpm')
  const plausibleSpan =
    heartRate.plausibleBpm.maximum - heartRate.plausibleBpm.minimum
  if (plausibleSpan < heartRate.hysteresisBpm * 2 + 3) {
    throw new RangeError(
      'hysteresisBpm must leave room for an ordered integer target range and reachable exits',
    )
  }
  positiveInteger(heartRate.classificationDwellMs, 'classificationDwellMs')
  positiveInteger(warmup.qualificationMs, 'qualificationMs')
  positiveInteger(warmup.countdownMs, 'countdownMs')
  return tuning
}
