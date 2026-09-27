import type { MissionResult } from '../../domain/mission/MissionResult'

export interface ApportionedPercentages {
  readonly below: number
  readonly operational: number
  readonly above: number
}

export type MissionPerformanceRating =
  'Controlled Finish' | 'Completed' | 'Incomplete'

interface MetricViewModel {
  readonly label: string
  readonly value: string
  readonly accessibleValue?: string
}

interface RangeMetricViewModel extends MetricViewModel {
  readonly percentage: number
}

export interface MissionResultViewModel {
  readonly outcome: MissionResult['outcome']
  readonly heading: string
  readonly summary: string
  readonly personnelRequired: string | null
  readonly reviewNote: string | null
  readonly duration: MetricViewModel
  readonly coreMetrics: readonly MetricViewModel[]
  readonly rangeMetrics: readonly RangeMetricViewModel[] | null
  readonly rangeExplanation: string
  readonly signalMetrics: readonly MetricViewModel[]
  readonly signalExplanation: string | null
  readonly eventMetrics: readonly MetricViewModel[]
  readonly puzzleMetrics: readonly MetricViewModel[]
  readonly interruptionMetrics: readonly MetricViewModel[]
  readonly rating: {
    readonly label: MissionPerformanceRating
    readonly explanation: string
    readonly criteria: string
  }
}

const RANGE_ORDER = ['below', 'operational', 'above'] as const

export function apportionPercentages(
  percentages: readonly [number, number, number],
): ApportionedPercentages {
  if (
    percentages.some((value) => !Number.isFinite(value) || value < 0) ||
    Math.abs(percentages.reduce((sum, value) => sum + value, 0) - 100) > 1e-8
  ) {
    throw new RangeError(
      'Percentages must be finite, nonnegative, and total 100',
    )
  }

  const floors = percentages.map(Math.floor)
  const remaining = 100 - floors.reduce((sum, value) => sum + value, 0)
  const ranked = percentages
    .map((value, index) => ({ index, remainder: value - floors[index]! }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.index - right.index,
    )
  for (let index = 0; index < remaining; index += 1) {
    floors[ranked[index]!.index]! += 1
  }
  return {
    below: floors[0]!,
    operational: floors[1]!,
    above: floors[2]!,
  }
}

export interface FormattedDuration {
  readonly visual: string
  readonly accessible: string
}

function durationPart(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`
}

export function formatDuration(milliseconds: number): FormattedDuration {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new RangeError('Duration must be finite and nonnegative')
  }

  const seconds = Math.round(milliseconds / 1_000)
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const remainingSeconds = seconds % 60
  const visual =
    hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
      : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
  const accessibleParts = [
    hours > 0 ? durationPart(hours, 'hour') : null,
    minutes > 0 ? durationPart(minutes, 'minute') : null,
    remainingSeconds > 0 ? durationPart(remainingSeconds, 'second') : null,
  ].filter((part): part is string => part !== null)

  return {
    visual,
    accessible:
      accessibleParts.length === 0 ? '0 seconds' : accessibleParts.join(' '),
  }
}

function formatBpm(value: number): string {
  return `${Math.round(value)} BPM`
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function metric(
  label: string,
  value: string,
  accessibleValue?: string,
): MetricViewModel {
  return accessibleValue === undefined
    ? { label, value }
    : { label, value, accessibleValue }
}

function durationMetric(label: string, milliseconds: number): MetricViewModel {
  const duration = formatDuration(milliseconds)
  return metric(label, duration.visual, duration.accessible)
}

function createRating(
  result: MissionResult,
  percentages: ApportionedPercentages | null,
): MissionResultViewModel['rating'] {
  const criteria =
    'Controlled Finish requires mission success and at least 75% operational time. Completed requires mission success. Incomplete means the reactor failed.'
  if (result.outcome === 'failure') {
    return {
      label: 'Incomplete',
      explanation: 'The reactor failed before the coolant route was completed.',
      criteria,
    }
  }
  if (percentages === null) {
    return {
      label: 'Completed',
      explanation:
        'Mission completed, but usable signal was insufficient to assess the 75% criterion.',
      criteria,
    }
  }
  if (percentages.operational >= 75) {
    return {
      label: 'Controlled Finish',
      explanation: `Mission completed with ${percentages.operational}% of usable classified time in the operational range.`,
      criteria,
    }
  }
  return {
    label: 'Completed',
    explanation:
      'Mission completed. A Controlled Finish requires at least 75% operational time.',
    criteria,
  }
}

export function createMissionResultViewModel(
  result: MissionResult,
): MissionResultViewModel {
  const canonicalPercentages =
    result.belowRangePercentage === null ||
    result.operationalPercentage === null ||
    result.aboveRangePercentage === null
      ? null
      : ([
          result.belowRangePercentage,
          result.operationalPercentage,
          result.aboveRangePercentage,
        ] as const)
  const percentages =
    canonicalPercentages === null
      ? null
      : apportionPercentages(canonicalPercentages)
  const rangeMetrics =
    percentages === null
      ? null
      : RANGE_ORDER.map((name) => ({
          label:
            name === 'below'
              ? 'Below range'
              : name === 'above'
                ? 'Above range'
                : 'Operational',
          value: `${percentages[name]}%`,
          percentage: percentages[name],
        }))

  const coreMetrics: MetricViewModel[] = [
    durationMetric('Active classified time', result.activeDurationMs),
  ]
  if (result.averageBpm !== null) {
    coreMetrics.push(metric('Average heart rate', formatBpm(result.averageBpm)))
  }
  if (result.peakBpm !== null) {
    coreMetrics.push(metric('Peak heart rate', formatBpm(result.peakBpm)))
  }
  coreMetrics.push(
    metric(
      'Station stability remaining',
      `${Math.round(result.endingStability)} of 100`,
    ),
  )

  const signalMetrics: MetricViewModel[] = []
  if (result.unclassifiedDurationMs > 0) {
    signalMetrics.push(
      durationMetric('Unclassified signal time', result.unclassifiedDurationMs),
    )
  }
  if (result.unusableSignalDurationMs > 0) {
    signalMetrics.push(
      durationMetric('Unusable signal time', result.unusableSignalDurationMs),
    )
  }

  const interruptionMetrics: MetricViewModel[] = []
  if (result.pauseCount > 0) {
    const duration = formatDuration(result.suspendedDurationMs)
    interruptionMetrics.push(
      metric(
        'Paused time',
        `${duration.visual} across ${countLabel(result.pauseCount, 'pause')}`,
        `${duration.accessible} across ${countLabel(result.pauseCount, 'pause')}`,
      ),
    )
  }
  if (result.disconnectCount > 0) {
    const duration = formatDuration(result.disconnectedDurationMs)
    interruptionMetrics.push(
      metric(
        'Disconnects',
        `${countLabel(result.disconnectCount, 'disconnect')}; ${duration.visual} included in paused time`,
        `${countLabel(result.disconnectCount, 'disconnect')}; ${duration.accessible} included in paused time`,
      ),
    )
  }

  const averageUnavailable = result.averageBpm === null
  const rangeUnavailable = percentages === null
  const signalExplanation =
    averageUnavailable && rangeUnavailable
      ? 'Usable signal data was insufficient for both an average BPM and a range breakdown.'
      : averageUnavailable
        ? 'Usable signal data was insufficient for an average BPM.'
        : rangeUnavailable
          ? 'Usable signal data was insufficient for a range breakdown.'
          : null

  return {
    outcome: result.outcome,
    heading:
      result.outcome === 'success' ? 'SYSTEM RESTORED' : 'SYSTEM NOT RESTORED',
    summary:
      result.outcome === 'success'
        ? 'Coolant routing returned to acceptable operating parameters.'
        : 'Intervention terminated outside acceptable stability parameters.',
    personnelRequired:
      result.outcome === 'success' ? 'ADDITIONAL PERSONNEL REQUIRED: 0' : null,
    reviewNote:
      result.outcome === 'failure' ? 'Incident forwarded for review.' : null,
    duration: durationMetric(
      result.outcome === 'success' ? 'Completion time' : 'Mission duration',
      result.missionDurationMs,
    ),
    coreMetrics,
    rangeMetrics,
    rangeExplanation:
      'Percentages describe usable classified time. Signal gaps are reported separately.',
    signalMetrics,
    signalExplanation,
    eventMetrics: [
      metric(
        'Low-output events',
        countLabel(result.lowOutputEpisodeCount, 'event'),
      ),
      metric(
        'Overload events',
        countLabel(result.overloadEpisodeCount, 'event'),
      ),
    ],
    puzzleMetrics: [
      metric(
        'Coolant route',
        result.puzzleCompleted ? 'Completed' : 'Incomplete',
      ),
      metric('Puzzle moves', countLabel(result.puzzleMoveCount, 'move')),
      metric('Hint use', result.hintUsed ? 'Hint used' : 'No hint used'),
    ],
    interruptionMetrics,
    rating: createRating(result, percentages),
  }
}
