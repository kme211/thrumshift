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
    <dl className="result-metrics">
      {metrics.map(({ label, value, accessibleValue }) => (
        <div
          key={label}
          className="result-metric min-w-0"
          data-metric={label}
          data-value={value}
        >
          <dt>{label}</dt>
          <dd className="break-words">
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

  const successful = view.outcome === 'success'

  return (
    <section
      className="mission-result transition-colors duration-300"
      aria-labelledby="result-heading"
      data-outcome={view.outcome}
    >
      <div className="equipment-shell mission-result__shell">
        <div className="equipment-shell__fasteners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <header className="mission-result__header">
          <div>
            <p className="equipment-kicker">
              KESS SYSTEMS // THRUMSHIFT STATION 04
            </p>
            <p className="mission-eyebrow">Mission result</p>
            <p className="mission-result__mission-name">
              Reactor Cooling Failure
            </p>
          </div>
          <div className="mission-result__seal" aria-hidden="true">
            <span className="status-lamp" data-status="healthy" />
            <span>
              REPORT SEALED
              <small>RUN ARCHIVE COMPLETE</small>
            </span>
          </div>
        </header>

        <div className="mission-result__console">
          <section
            className="equipment-module mission-result__disposition"
            aria-label="Mission disposition"
          >
            <div className="equipment-label" aria-hidden="true">
              <span>Mission disposition</span>
              <span>MR-04 / {successful ? 'RESTORED' : 'NOT RESTORED'}</span>
            </div>
            <div className="crt-display crt-display--result">
              <div className="mission-result__state" aria-hidden="true">
                <span
                  className="status-lamp"
                  data-status={successful ? 'healthy' : 'critical'}
                />
                {successful
                  ? 'KESS SYSTEMS // OPERATIONAL RECORD'
                  : 'KESS SYSTEMS // INCIDENT REVIEW'}
              </div>
              <h1 ref={headingRef} id="result-heading" tabIndex={-1}>
                {view.heading}
              </h1>
              <p className="mission-result__summary">{view.summary}</p>
              {view.personnelRequired === null ? null : (
                <p className="mission-result__personnel">
                  {view.personnelRequired}
                </p>
              )}
              {view.reviewNote === null ? null : (
                <p className="mission-result__review-note">{view.reviewNote}</p>
              )}
              <div className="mission-result__duration">
                <p>{view.duration.label}</p>
                <strong>
                  <span aria-hidden="true">{view.duration.value}</span>
                  <span className="sr-only">
                    {view.duration.accessibleValue}
                  </span>
                </strong>
              </div>
            </div>
          </section>

          <section
            className="equipment-module mission-result__record"
            aria-label="Mission archive"
          >
            <div className="equipment-label" aria-hidden="true">
              <span>Mission archive</span>
              <span>AR-04 / SEALED</span>
            </div>
            <div className="mission-result__ledger">
              <section aria-labelledby="result-overview-heading">
                <h2 id="result-overview-heading">Mission overview</h2>
                <MetricList metrics={view.coreMetrics} />
                <p className="mission-result__note">
                  BPM means beats per minute.
                </p>
              </section>

              <section aria-labelledby="range-breakdown-heading">
                <h2 id="range-breakdown-heading">Time in gameplay range</h2>
                {view.rangeMetrics === null ? null : (
                  <MetricList metrics={view.rangeMetrics} />
                )}
                <p className="mission-result__note">{view.rangeExplanation}</p>
                {view.signalExplanation === null ? null : (
                  <p className="mission-result__signal-note">
                    {view.signalExplanation}
                  </p>
                )}
                {view.signalMetrics.length === 0 ? null : (
                  <MetricList metrics={view.signalMetrics} />
                )}
              </section>

              <section aria-labelledby="events-heading">
                <h2 id="events-heading">Mission events</h2>
                <MetricList metrics={view.eventMetrics} />
              </section>

              <section aria-labelledby="puzzle-summary-heading">
                <h2 id="puzzle-summary-heading">Coolant routing</h2>
                <MetricList metrics={view.puzzleMetrics} />
              </section>

              {view.interruptionMetrics.length === 0 ? null : (
                <section aria-labelledby="interruptions-heading">
                  <h2 id="interruptions-heading">Interruptions</h2>
                  <MetricList metrics={view.interruptionMetrics} />
                </section>
              )}
            </div>
          </section>

          <section
            className="equipment-module mission-result__rating"
            aria-labelledby="rating-heading"
          >
            <div className="equipment-label" aria-hidden="true">
              <span>Performance classification</span>
              <span>PC-04 / FINAL</span>
            </div>
            <div className="mission-result__rating-sheet">
              <h2 id="rating-heading">Performance rating</h2>
              <p className="mission-result__rating-value">
                {view.rating.label}
              </p>
              <p className="mission-result__rating-explanation">
                {view.rating.explanation}
              </p>
              <p className="mission-result__rating-criteria">
                {view.rating.criteria}
              </p>
            </div>
          </section>
        </div>

        <footer className="control-deck mission-result__control-deck">
          <div className="control-deck__legend" aria-hidden="true">
            <span>MISSION RECORD BUS</span>
            <strong>ARCHIVE COMMITTED</strong>
          </div>
          <div className="control-deck__state" aria-hidden="true">
            <span
              className="status-lamp"
              data-status={successful ? 'healthy' : 'critical'}
            />
            RUN CLOSED
          </div>
          <button
            className="equipment-button mission-result__run-again"
            type="button"
            onClick={onRunAgain}
          >
            Run Again
          </button>
        </footer>
      </div>
    </section>
  )
}
