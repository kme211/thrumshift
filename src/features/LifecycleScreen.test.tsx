import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { AppState } from '../app/AppState'
import { createWarmupSession, type WarmupSession } from '../app/WarmupSession'
import { defaultGameplayTuning } from '../config/gameplayTuning'
import type { ShellMissionState, ShellResult } from '../app/ShellState'
import { LifecycleScreen } from './LifecycleScreen'

type State = AppState<WarmupSession, ShellMissionState, ShellResult>
const runId = 'run-shell'
const warmup = createWarmupSession(
  0,
  { lowerBpm: 100, upperBpm: 140 },
  defaultGameplayTuning,
)
const mission = { placeholder: 'mission' } as const

describe('LifecycleScreen', () => {
  it.each<[State, string]>([
    [{ phase: 'preMission' }, 'Reactor Cooling Failure'],
    [{ phase: 'warming', runId, warmup }, 'Warm-up'],
    [{ phase: 'countdown', runId, warmup }, 'Mission countdown'],
    [{ phase: 'activeMission', runId, mission }, 'Reactor Cooling Failure'],
    [
      { phase: 'result', runId, result: { outcome: 'success' } },
      'Mission successful',
    ],
    [
      { phase: 'result', runId, result: { outcome: 'failure' } },
      'Mission failed',
    ],
  ])(
    'renders a labeled region and focused heading for %#',
    (state, heading) => {
      render(<LifecycleScreen state={state} />)
      const title = screen.getByRole('heading', { level: 1, name: heading })
      expect(screen.getByRole('region', { name: heading })).toBeInTheDocument()
      expect(title).toHaveFocus()
    },
  )

  it('renders pause and disconnect variants with non-color blocker text', () => {
    const { rerender } = render(
      <LifecycleScreen
        state={{
          phase: 'suspended',
          resumeTarget: { phase: 'activeMission', runId, mission },
          reasons: ['manual'],
        }}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mission paused' }),
    ).toHaveFocus()
    expect(screen.getByText('manual')).toBeInTheDocument()

    rerender(
      <LifecycleScreen
        state={{
          phase: 'suspended',
          resumeTarget: { phase: 'activeMission', runId, mission },
          reasons: ['disconnect', 'hidden'],
        }}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Connection interrupted' }),
    ).toHaveFocus()
    expect(screen.getByText('disconnect')).toBeInTheDocument()
    expect(screen.getByText('hidden')).toBeInTheDocument()
  })
})
