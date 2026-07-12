export interface TargetRangeTuning {
  readonly minimumBpm: number
  readonly maximumBpm: number
  readonly defaultLowerBpm: number
  readonly defaultUpperBpm: number
}

export interface HeartRateClassifierTuning {
  readonly plausibleBpm: {
    readonly minimum: number
    readonly maximum: number
  }
  readonly filterWindowMs: number
  readonly filterSampleLimit: number
  readonly validDataDensityWindowMs: number
  readonly minimumValidSamplesInDensityWindow: number
  readonly staleAfterMs: number
  readonly hysteresisBpm: number
  readonly classificationDwellMs: number
}

export interface WarmupTuning {
  readonly qualificationMs: number
}

export interface CountdownTuning {
  readonly durationMs: number
}

export interface GameplayTuning {
  readonly targetRange: TargetRangeTuning
  readonly heartRateClassifier: HeartRateClassifierTuning
  readonly warmup: WarmupTuning
  readonly countdown: CountdownTuning
}

export const defaultGameplayTuning: GameplayTuning = {
  targetRange: {
    minimumBpm: 40,
    maximumBpm: 220,
    defaultLowerBpm: 100,
    defaultUpperBpm: 140,
  },
  heartRateClassifier: {
    plausibleBpm: { minimum: 30, maximum: 240 },
    filterWindowMs: 3_000,
    filterSampleLimit: 5,
    validDataDensityWindowMs: 4_000,
    minimumValidSamplesInDensityWindow: 3,
    staleAfterMs: 3_000,
    hysteresisBpm: 3,
    classificationDwellMs: 2_000,
  },
  warmup: { qualificationMs: 10_000 },
  countdown: { durationMs: 3_000 },
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`)
  }
}

/** Validates configuration once at the composition boundary, never in a timer. */
export function validateGameplayTuning(tuning: GameplayTuning): GameplayTuning {
  const { countdown, heartRateClassifier, targetRange, warmup } = tuning
  positiveInteger(
    heartRateClassifier.plausibleBpm.minimum,
    'plausibleBpm.minimum',
  )
  positiveInteger(
    heartRateClassifier.plausibleBpm.maximum,
    'plausibleBpm.maximum',
  )
  if (
    heartRateClassifier.plausibleBpm.minimum >=
    heartRateClassifier.plausibleBpm.maximum
  ) {
    throw new RangeError('plausibleBpm.minimum must be below maximum')
  }
  positiveInteger(heartRateClassifier.filterWindowMs, 'filterWindowMs')
  positiveInteger(heartRateClassifier.filterSampleLimit, 'filterSampleLimit')
  positiveInteger(
    heartRateClassifier.validDataDensityWindowMs,
    'validDataDensityWindowMs',
  )
  positiveInteger(
    heartRateClassifier.minimumValidSamplesInDensityWindow,
    'minimumValidSamplesInDensityWindow',
  )
  positiveInteger(heartRateClassifier.staleAfterMs, 'staleAfterMs')
  positiveInteger(heartRateClassifier.hysteresisBpm, 'hysteresisBpm')
  const plausibleSpan =
    heartRateClassifier.plausibleBpm.maximum -
    heartRateClassifier.plausibleBpm.minimum
  if (plausibleSpan < heartRateClassifier.hysteresisBpm * 2 + 3) {
    throw new RangeError(
      'hysteresisBpm must leave room for an ordered integer target range and reachable exits',
    )
  }
  for (const [name, value] of Object.entries(targetRange)) {
    positiveInteger(value, `targetRange.${name}`)
  }
  if (
    targetRange.minimumBpm >= targetRange.maximumBpm ||
    targetRange.minimumBpm - heartRateClassifier.hysteresisBpm <=
      heartRateClassifier.plausibleBpm.minimum ||
    targetRange.maximumBpm + heartRateClassifier.hysteresisBpm >=
      heartRateClassifier.plausibleBpm.maximum ||
    targetRange.defaultLowerBpm < targetRange.minimumBpm ||
    targetRange.defaultUpperBpm > targetRange.maximumBpm ||
    targetRange.defaultLowerBpm >= targetRange.defaultUpperBpm
  ) {
    throw new RangeError('targetRange defaults and limits are inconsistent')
  }
  positiveInteger(
    heartRateClassifier.classificationDwellMs,
    'classificationDwellMs',
  )
  positiveInteger(warmup.qualificationMs, 'qualificationMs')
  positiveInteger(countdown.durationMs, 'countdown.durationMs')
  return tuning
}
