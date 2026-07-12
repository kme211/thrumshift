import { useEffect, useRef } from 'react'

import { defaultGameplayTuning } from '../config/gameplayTuning'
import {
  getCountdownRemainingMs,
  getWarmupProgressMs,
} from '../domain/mission/warmup'
import type { WarmupSession } from '../app/WarmupFlowController'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'
import { TargetRangeFields } from './TargetRangeFields'

interface WarmupScreenProps {
  readonly session: WarmupSession
  readonly status: TelemetrySourceStatus
  readonly targetDraft: { readonly lower: string; readonly upper: string }
  readonly targetError: string | null
  readonly onConnect: () => void
  readonly onTargetChange: (field: 'lower' | 'upper', value: string) => void
  readonly onTargetCommit: () => void
  readonly onBack: () => void
}

function stableLabel(session: WarmupSession): string {
  const classifier = session.classifier
  if (classifier.signalQuality !== 'usable') return 'Unusable signal'
  if (classifier.stableClassification === null) return 'Pending — hold steady'
  if (classifier.stableClassification === 'below') return 'Below range'
  if (classifier.stableClassification === 'above') return 'Above range'
  return 'Operational'
}

export function WarmupScreen(props: WarmupScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusKey = props.session.warmup.phase
  useEffect(() => headingRef.current?.focus(), [focusKey])
  const { classifier, warmup, targetRange } = props.session
  const progress = getWarmupProgressMs(
    warmup,
    defaultGameplayTuning.warmup.qualificationMs,
  )
  const remaining = getCountdownRemainingMs(
    warmup,
    defaultGameplayTuning.countdown.durationMs,
  )
  const progressSeconds = Math.floor(progress / 1_000)
  return (
    <section
      className="mx-auto max-w-3xl transition-colors duration-300"
      aria-labelledby="screen-heading"
    >
      <div className="border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
          Operator preparation
        </p>
        <h1
          ref={headingRef}
          id="screen-heading"
          tabIndex={-1}
          className="mt-2 text-3xl font-semibold outline-none sm:text-5xl"
        >
          {warmup.phase === 'countdown' ? 'Mission countdown' : 'Warm-up'}
        </h1>
        <output
          className="mt-6 block text-6xl font-bold sm:text-8xl"
          aria-label="Latest heart rate"
        >
          {classifier.latestValidBpm ?? '—'}{' '}
          <span className="text-xl">BPM</span>
        </output>
        <p className="mt-2">
          Target: {targetRange.lowerBpm}–{targetRange.upperBpm} BPM
        </p>
        <div className="mt-6 border-l-4 border-[var(--color-accent)] pl-4">
          <p>
            Signal quality: <strong>{classifier.signalQuality}</strong>
          </p>
          <p className="mt-1">
            Stable gameplay status:{' '}
            <strong>{stableLabel(props.session)}</strong>
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Latest BPM updates immediately; gameplay status requires stable
            fresh evidence.
          </p>
        </div>
        {remaining === null ? (
          <div className="mt-6">
            <label htmlFor="warmup-progress">
              Consecutive operational progress: {progressSeconds} of 10 seconds
            </label>
            <progress
              id="warmup-progress"
              className="mt-2 block w-full"
              max={defaultGameplayTuning.warmup.qualificationMs}
              value={progress}
            >
              {progressSeconds} seconds
            </progress>
          </div>
        ) : (
          <div className="mt-6" role="status">
            <p className="text-sm uppercase tracking-widest">
              Qualification confirmed
            </p>
            <p className="mt-2 text-6xl font-bold">
              {Math.ceil(remaining / 1_000)}
            </p>
            <p>
              Keep the signal operational. Countdown cancels if qualification is
              lost.
            </p>
          </div>
        )}
        {props.status.state !== 'connected' ? (
          <div className="mt-6">
            <p>
              {props.status.state === 'error'
                ? props.status.error.message
                : 'Monitor disconnected. Warm-up progress was reset.'}
            </p>
            <button className="mt-3" type="button" onClick={props.onConnect}>
              Reconnect monitor
            </button>
          </div>
        ) : null}
        <TargetRangeFields
          lower={props.targetDraft.lower}
          upper={props.targetDraft.upper}
          error={props.targetError}
          onChange={props.onTargetChange}
          onCommit={props.onTargetCommit}
        />
        <button className="mt-6" type="button" onClick={props.onBack}>
          Back to briefing
        </button>
      </div>
    </section>
  )
}
