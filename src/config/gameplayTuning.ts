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

/**
 * Stability is measured in station-stability points. Rates are points per
 * eligible active-play second; suspension, unusable signal, and an absent
 * stable classification contribute no elapsed mission time and no rate.
 */
export interface StabilityTuning {
  readonly minimum: number
  readonly maximum: number
  readonly initial: number
  readonly belowDrainPerSecond: number
  readonly aboveDrainPerSecond: number
  readonly operationalRecoveryPerSecond: number
}

export interface MissionStatisticsTuning {
  readonly minimumValidSampleCount: number
  readonly minimumUsableDurationMs: number
}

export interface PuzzleTuning {
  readonly hintEligibilityMs: number
}

export interface GameplayTuning {
  readonly targetRange: TargetRangeTuning
  readonly heartRateClassifier: HeartRateClassifierTuning
  readonly warmup: WarmupTuning
  readonly countdown: CountdownTuning
  readonly stability: StabilityTuning
  readonly missionStatistics: MissionStatisticsTuning
  readonly puzzle: PuzzleTuning
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
  stability: {
    minimum: 0,
    maximum: 100,
    initial: 100,
    belowDrainPerSecond: 2,
    aboveDrainPerSecond: 3,
    operationalRecoveryPerSecond: 1,
  },
  missionStatistics: {
    minimumValidSampleCount: 3,
    minimumUsableDurationMs: 4_000,
  },
  puzzle: { hintEligibilityMs: 10_000 },
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`)
  }
}

function finiteNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`)
  }
}

export function validateStabilityTuning(tuning: unknown): StabilityTuning {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new RangeError('stability tuning must be an object')
  }
  const runtimeTuning = tuning as Record<PropertyKey, unknown>
  const requiredProperties = [
    'minimum',
    'maximum',
    'initial',
    'belowDrainPerSecond',
    'aboveDrainPerSecond',
    'operationalRecoveryPerSecond',
  ] as const
  for (const name of requiredProperties) {
    if (!Object.hasOwn(tuning, name)) {
      throw new RangeError(`stability.${name} is required`)
    }
    finiteNumber(runtimeTuning[name], `stability.${name}`)
  }
  const {
    aboveDrainPerSecond,
    belowDrainPerSecond,
    initial,
    maximum,
    minimum,
    operationalRecoveryPerSecond,
  } = runtimeTuning as unknown as StabilityTuning
  if (minimum >= maximum) {
    throw new RangeError('stability.minimum must be below maximum')
  }
  if (initial <= minimum || initial > maximum) {
    throw new RangeError(
      'stability.initial must be above minimum and no greater than maximum',
    )
  }
  if (belowDrainPerSecond <= 0 || aboveDrainPerSecond <= 0) {
    throw new RangeError('stability drain rates must be positive')
  }
  if (operationalRecoveryPerSecond < 0) {
    throw new RangeError(
      'stability.operationalRecoveryPerSecond must be nonnegative',
    )
  }
  return runtimeTuning as unknown as StabilityTuning
}

export function validateMissionStatisticsTuning(
  tuning: unknown,
): MissionStatisticsTuning {
  if (typeof tuning !== 'object' || tuning === null) {
    throw new RangeError('missionStatistics tuning must be an object')
  }
  const runtimeTuning = tuning as Record<PropertyKey, unknown>
  const properties = [
    'minimumValidSampleCount',
    'minimumUsableDurationMs',
  ] as const
  for (const name of properties) {
    if (!Object.hasOwn(runtimeTuning, name)) {
      throw new RangeError(`missionStatistics.${name} is required`)
    }
    const value = runtimeTuning[name]
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new RangeError(
        `missionStatistics.${name} must be a positive safe integer`,
      )
    }
  }
  return runtimeTuning as unknown as MissionStatisticsTuning
}

/** Validates configuration once at the composition boundary, never in a timer. */
export function validateGameplayTuning(tuning: GameplayTuning): GameplayTuning {
  const {
    countdown,
    heartRateClassifier,
    missionStatistics,
    stability,
    targetRange,
    warmup,
  } = tuning
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
  positiveInteger(tuning.puzzle.hintEligibilityMs, 'puzzle.hintEligibilityMs')
  validateMissionStatisticsTuning(missionStatistics)
  validateStabilityTuning(stability)
  return tuning
}
