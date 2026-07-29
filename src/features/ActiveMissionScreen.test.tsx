import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMissionRun } from '../app/MissionRun'
import { ControlledCoolantPuzzle } from '../components/mission/CoolantPuzzle'
import { defaultGameplayTuning } from '../config/gameplayTuning'
import { createClassifierState } from '../domain/heart-rate/classifier'
import { ActiveMissionScreen } from './ActiveMissionScreen'

function missionRun() {
  const classifier = {
    ...createClassifierState(0),
    latestValidBpm: 148,
    latestValidSampleTimeMs: 0,
    filteredBpm: 148,
    signalQuality: 'usable' as const,
    stableClassification: 'above' as const,
  }
  const run = createMissionRun(
    0,
    { lowerBpm: 100, upperBpm: 140 },
    classifier,
    defaultGameplayTuning,
  )
  return {
    ...run,
    session: {
      ...run.session,
      mission: {
        ...run.session.mission,
        activeElapsedTimeMs: defaultGameplayTuning.puzzle.hintEligibilityMs,
        stability: 72,
        signalQuality: 'usable' as const,
        stableClassification: 'above' as const,
      },
    },
  }
}

function renderMission(paused = false) {
  const handlers = {
    onRotate: vi.fn(),
    onHint: vi.fn(),
    onReset: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
  }
  const view = render(
    <ActiveMissionScreen
      run={missionRun()}
      telemetryStatus={{ state: 'connected' }}
      paused={paused}
      hintEligible
      hintRemainingMs={0}
      {...handlers}
    />,
  )
  return { ...handlers, ...view }
}

describe('ActiveMissionScreen', () => {
  it('separates latest BPM/classification from accumulated station stability without noisy BPM live output', () => {
    renderMission()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Reactor Cooling Failure',
      }),
    ).toHaveFocus()
    expect(screen.getByLabelText('Latest heart rate')).toHaveTextContent(
      '148 BPM',
    )
    expect(screen.getByText('Above range')).toBeInTheDocument()
    expect(screen.getByText('Target range: 100–140 BPM')).toBeInTheDocument()
    expect(
      screen.getByRole('meter', { name: 'Station stability' }),
    ).toHaveAttribute('aria-valuetext', 'Approximately 70 percent, decreasing')
    expect(screen.getByLabelText('Latest heart rate')).not.toHaveAttribute(
      'aria-live',
    )
  })

  it('keeps puzzle, hint, and persistent pause controls touch-sized and intent-only', async () => {
    const user = userEvent.setup()
    const { onRotate, onHint, onPause } = renderMission()
    await user.click(screen.getAllByRole('button', { name: /Row/ })[1]!)
    await user.click(screen.getByRole('button', { name: 'Request hint' }))
    await user.click(screen.getByRole('button', { name: 'Pause mission' }))
    expect(onRotate).toHaveBeenCalledTimes(1)
    expect(onHint).toHaveBeenCalledTimes(1)
    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('moves focus into paused UI, disables puzzle controls, and explicitly resumes', async () => {
    const user = userEvent.setup()
    const { onResume } = renderMission(true)
    const resume = screen.getByRole('button', { name: 'Resume mission' })
    expect(
      screen.getByRole('dialog', { name: 'Mission paused' }),
    ).toBeInTheDocument()
    expect(resume).toHaveFocus()
    expect(screen.getAllByRole('button', { name: /Row/ })[0]).toBeDisabled()
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(screen.getByRole('dialog', { name: 'Mission paused' }), cancel)
    expect(cancel.defaultPrevented).toBe(true)
    await user.click(resume)
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('keeps countdown changes silent and announces only hint and completion transitions', async () => {
    const run = missionRun()
    const handlers = {
      onRotate: vi.fn(),
      onHint: vi.fn(),
      onReset: vi.fn(),
    }
    const view = render(
      <ControlledCoolantPuzzle
        puzzle={run.puzzle}
        hint={null}
        rotationCounts={{}}
        disabled={false}
        complete={false}
        hintEligible={false}
        hintRemainingMs={10_000}
        {...handlers}
      />,
    )
    const liveRegion = view.container.querySelector('[aria-live="polite"]')
    expect(liveRegion).toHaveTextContent('')
    const countdown = screen.getByText(
      'Hint available after 10 more seconds of active play.',
    )
    expect(
      countdown.closest('[aria-live], [role="status"]'),
    ).not.toBeInTheDocument()

    view.rerender(
      <ControlledCoolantPuzzle
        puzzle={run.puzzle}
        hint={null}
        rotationCounts={{}}
        disabled={false}
        complete={false}
        hintEligible={false}
        hintRemainingMs={9_000}
        {...handlers}
      />,
    )
    expect(liveRegion).toHaveTextContent('')
    expect(
      screen.getByText('Hint available after 9 more seconds of active play.'),
    ).toBeInTheDocument()

    view.rerender(
      <ControlledCoolantPuzzle
        puzzle={run.puzzle}
        hint={null}
        rotationCounts={{}}
        disabled={false}
        complete={false}
        hintEligible
        hintRemainingMs={0}
        {...handlers}
      />,
    )
    expect(liveRegion).toHaveTextContent('Hint ready.')

    const hint = { tileId: 'top-straight', row: 0, column: 1 }
    view.rerender(
      <ControlledCoolantPuzzle
        puzzle={run.puzzle}
        hint={hint}
        rotationCounts={{}}
        disabled={false}
        complete={false}
        hintEligible
        hintRemainingMs={0}
        {...handlers}
      />,
    )
    expect(liveRegion).toHaveTextContent('Hint: rotate row 1, column 2.')

    view.rerender(
      <ControlledCoolantPuzzle
        puzzle={run.puzzle}
        hint={null}
        rotationCounts={{}}
        disabled={false}
        complete={false}
        hintEligible
        hintRemainingMs={0}
        {...handlers}
      />,
    )
    expect(liveRegion).toHaveTextContent('')

    view.rerender(
      <ControlledCoolantPuzzle
        puzzle={run.puzzle}
        hint={hint}
        rotationCounts={{}}
        disabled={false}
        complete={false}
        hintEligible
        hintRemainingMs={0}
        {...handlers}
      />,
    )
    expect(liveRegion).toHaveTextContent('Hint: rotate row 1, column 2.')

    const unchangedAnnouncement = liveRegion?.textContent
    const announcementMutations: MutationRecord[] = []
    const observer = new MutationObserver((mutations) => {
      announcementMutations.push(...mutations)
    })
    if (liveRegion !== null) {
      observer.observe(liveRegion, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    }
    view.rerender(
      <ControlledCoolantPuzzle
        puzzle={run.puzzle}
        hint={hint}
        rotationCounts={{}}
        disabled={false}
        complete={false}
        hintEligible
        hintRemainingMs={0}
        {...handlers}
      />,
    )
    await Promise.resolve()
    expect(liveRegion?.textContent).toBe(unchangedAnnouncement)
    expect(announcementMutations).toEqual([])
    observer.disconnect()

    view.rerender(
      <ControlledCoolantPuzzle
        puzzle={run.puzzle}
        hint={hint}
        rotationCounts={{}}
        disabled
        complete
        hintEligible
        hintRemainingMs={0}
        {...handlers}
      />,
    )
    expect(liveRegion).toHaveTextContent(
      'Coolant route complete. Reactor flow restored.',
    )
  })
})
