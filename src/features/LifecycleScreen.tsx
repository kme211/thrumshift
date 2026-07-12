import { useEffect, useRef } from 'react'

import type { AppState } from '../app/AppState'
import type {
  ShellMissionState,
  ShellResult,
  ShellWarmupState,
} from '../app/ShellState'

type ShellAppState = AppState<ShellWarmupState, ShellMissionState, ShellResult>

interface ScreenContent {
  readonly eyebrow: string
  readonly heading: string
  readonly description: string
}

function getScreenContent(state: ShellAppState): ScreenContent {
  switch (state.phase) {
    case 'preMission':
      return {
        eyebrow: 'Mission briefing',
        heading: 'Reactor Cooling Failure',
        description:
          'Connect an Operator bio-link and review mission parameters before beginning warm-up.',
      }
    case 'warming':
      return {
        eyebrow: 'Operator preparation',
        heading: 'Warm-up',
        description:
          'Warm-up status and qualification controls arrive in Gate 5.',
      }
    case 'countdown':
      return {
        eyebrow: 'Launch sequence',
        heading: 'Mission countdown',
        description:
          'Countdown timing and qualification rules arrive in Gate 5.',
      }
    case 'activeMission':
      return {
        eyebrow: 'Active mission',
        heading: 'Reactor Cooling Failure',
        description:
          'Mission controls, station stability, and coolant routing are intentionally unavailable in this shell.',
      }
    case 'suspended': {
      const disconnected = state.reasons.includes('disconnect')
      return {
        eyebrow: 'Mission interruption',
        heading: disconnected ? 'Connection interrupted' : 'Mission paused',
        description:
          'Progress is suspended. Resolve every listed blocker before choosing the appropriate recovery action.',
      }
    }
    case 'result':
      return state.result.outcome === 'success'
        ? {
            eyebrow: 'Mission result',
            heading: 'Mission successful',
            description:
              'Detailed performance metrics and rating are intentionally deferred.',
          }
        : {
            eyebrow: 'Mission result',
            heading: 'Mission failed',
            description:
              'Detailed performance metrics and rating are intentionally deferred.',
          }
  }
}

function getFocusKey(state: ShellAppState): string {
  if (state.phase === 'suspended')
    return `${state.phase}:${state.reasons.join(',')}`
  if (state.phase === 'result') return `${state.phase}:${state.result.outcome}`
  return state.phase
}

export function LifecycleScreen({ state }: { readonly state: ShellAppState }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const content = getScreenContent(state)
  const focusKey = getFocusKey(state)

  useEffect(() => {
    headingRef.current?.focus()
  }, [focusKey])

  return (
    <section
      className="mx-auto flex min-h-[calc(100dvh-(2*var(--space-page)))] max-w-3xl items-center transition-colors duration-300"
      aria-labelledby="screen-heading"
    >
      <div className="w-full border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
          Stay in range. Keep the station alive.
        </p>
        <p className="mt-3 text-lg font-bold tracking-tight">Thrumshift</p>
        <div className="mt-10 border-l-4 border-[var(--color-accent)] pl-5 sm:mt-14">
          <p className="text-sm uppercase tracking-widest text-[var(--color-text-muted)]">
            {content.eyebrow}
          </p>
          <h1
            ref={headingRef}
            id="screen-heading"
            tabIndex={-1}
            className="mt-2 text-3xl font-semibold outline-none sm:text-5xl"
          >
            {content.heading}
          </h1>
          <p className="mt-3 max-w-prose text-base leading-7 text-[var(--color-text-muted)] sm:text-lg">
            {content.description}
          </p>
          {state.phase === 'suspended' ? (
            <div className="mt-6" aria-labelledby="suspension-reasons-heading">
              <h2 id="suspension-reasons-heading" className="font-semibold">
                Active blockers
              </h2>
              <ul className="mt-2 list-disc pl-6">
                {state.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
