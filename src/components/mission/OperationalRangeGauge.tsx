import type {
  RangeClassification,
  TargetRange,
} from '../../domain/heart-rate/classifier'
import { rangeClassificationIndicator } from './rangeClassificationIndicator'

const labels: Record<RangeClassification, string> = {
  below: 'Below range',
  operational: 'Operational',
  above: 'Above range',
}

function classificationLabel(value: RangeClassification | null): string {
  return value === null ? 'Establishing stable classification' : labels[value]
}

export function OperationalRangeGauge({
  bpm,
  targetRange,
  classification,
}: {
  readonly bpm: number | null
  readonly targetRange: TargetRange
  readonly classification: RangeClassification | null
}) {
  return (
    <section
      className="mission-vitals"
      aria-labelledby="heart-rate-heading"
      data-classification={classification ?? 'pending'}
    >
      <h2 id="heart-rate-heading" className="sr-only">
        Current heart rate
      </h2>
      <p className="mission-bpm" aria-label="Latest heart rate">
        <span>{bpm ?? '—'}</span> <small>BPM</small>
      </p>
      <p
        className="mission-classification"
        data-classification={classification ?? 'pending'}
      >
        <span aria-hidden="true">
          {rangeClassificationIndicator(classification)}
        </span>{' '}
        {classificationLabel(classification)}
      </p>
      <p className="mission-target">
        Target range: {targetRange.lowerBpm}–{targetRange.upperBpm} BPM
      </p>
    </section>
  )
}
