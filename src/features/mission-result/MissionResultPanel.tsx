import { useEffect, useRef } from 'react'

import type { MissionResult } from '../../domain/mission/MissionResult'
import { createMissionResultViewModel } from './missionResultViewModel'

interface MissionResultPanelProps {
  readonly result: MissionResult
  readonly onRunAgain: () => void
}

function MetricList({
  metrics,
}: {
  readonly metrics: readonly {
    readonly label: string
    readonly value: string
    readonly accessibleValue?: string
  }[]
}) {
  return (
    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
      {metrics.map(({ label, value, accessibleValue }) => (
        <div
          key={label}
          className="min-w-0 border border-[var(--color-border)] p-4"
        >
          <dt className="text-sm text-[var(--color-text-muted)]">{label}</dt>
          <dd className="mt-1 break-words text-lg font-semibold">
            <span
              aria-hidden={accessibleValue === undefined ? undefined : true}
            >
              {value}
            </span>
            {accessibleValue === undefined ? null : (
              <span className="sr-only">{accessibleValue}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function MissionResultPanel({
  result,
  onRunAgain,
}: MissionResultPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const view = createMissionResultViewModel(result)

  useEffect(() => headingRef.current?.focus(), [])

  return (
    <section
      className="mx-auto max-w-3xl transition-colors duration-300"
      aria-labelledby="result-heading"
      data-outcome={view.outcome}
    >
      <div className="border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
          Mission result
        </p>
        <h1
          ref={headingRef}
          id="result-heading"
          tabIndex={-1}
          className="mt-2 text-3xl font-semibold outline-none sm:text-5xl"
        >
          {view.heading}
        </h1>
        <p className="mt-3 max-w-prose leading-7 text-[var(--color-text-muted)]">
          {view.summary}
        </p>

        <div className="mt-8 border-l-4 border-[var(--color-accent)] pl-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            {view.duration.label}
          </p>
          <p className="mt-1 text-4xl font-bold">
            <span aria-hidden="true">{view.duration.value}</span>
            <span className="sr-only">{view.duration.accessibleValue}</span>
          </p>
        </div>

        <section className="mt-8" aria-labelledby="result-overview-heading">
          <h2 id="result-overview-heading" className="text-xl font-semibold">
            Mission overview
          </h2>
          <MetricList metrics={view.coreMetrics} />
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            BPM means beats per minute.
          </p>
        </section>

        <section className="mt-8" aria-labelledby="range-breakdown-heading">
          <h2 id="range-breakdown-heading" className="text-xl font-semibold">
            Time in gameplay range
          </h2>
          {view.rangeMetrics === null ? null : (
            <MetricList metrics={view.rangeMetrics} />
          )}
          <p className="mt-3 max-w-prose text-sm leading-6 text-[var(--color-text-muted)]">
            {view.rangeExplanation}
          </p>
          {view.signalExplanation === null ? null : (
            <p className="mt-3 border-l-4 border-[var(--color-border)] pl-4 leading-6">
              {view.signalExplanation}
            </p>
          )}
          {view.signalMetrics.length === 0 ? null : (
            <MetricList metrics={view.signalMetrics} />
          )}
        </section>

        <section className="mt-8" aria-labelledby="events-heading">
          <h2 id="events-heading" className="text-xl font-semibold">
            Mission events
          </h2>
          <MetricList metrics={view.eventMetrics} />
        </section>

        <section className="mt-8" aria-labelledby="puzzle-summary-heading">
          <h2 id="puzzle-summary-heading" className="text-xl font-semibold">
            Coolant routing
          </h2>
          <MetricList metrics={view.puzzleMetrics} />
        </section>

        {view.interruptionMetrics.length === 0 ? null : (
          <section className="mt-8" aria-labelledby="interruptions-heading">
            <h2 id="interruptions-heading" className="text-xl font-semibold">
              Interruptions
            </h2>
            <MetricList metrics={view.interruptionMetrics} />
          </section>
        )}

        <section
          className="mt-8 border border-[var(--color-border)] p-5"
          aria-labelledby="rating-heading"
        >
          <h2 id="rating-heading" className="text-xl font-semibold">
            Performance rating
          </h2>
          <p className="mt-2 text-2xl font-bold">{view.rating.label}</p>
          <p className="mt-2 max-w-prose leading-6">
            {view.rating.explanation}
          </p>
          <p className="mt-3 max-w-prose text-sm leading-6 text-[var(--color-text-muted)]">
            {view.rating.criteria}
          </p>
        </section>

        <button
          className="mt-8 w-full text-lg font-semibold"
          type="button"
          onClick={onRunAgain}
        >
          Run Again
        </button>
      </div>
    </section>
  )
}
