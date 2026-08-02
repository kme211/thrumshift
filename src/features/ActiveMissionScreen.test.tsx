import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMissionRun } from '../app/MissionRun'
import { ControlledCoolantPuzzle } from '../components/mission/CoolantPuzzle'
import { defaultGameplayTuning } from '../config/gameplayTuning'
import { createClassifierState } from '../domain/heart-rate/classifier'
import type { TelemetrySourceStatus } from '../telemetry/HeartRateTelemetrySource'
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

function renderMission(
  paused = false,
  reasons: readonly (
    'manual' | 'resumeRequired' | 'hidden' | 'disconnect' | 'staleSignal'
  )[] = paused ? ['manual'] : [],
  canResume = true,
  initialTelemetryStatus?: TelemetrySourceStatus,
) {
  const handlers = {
    onRotate: vi.fn(),
    onHint: vi.fn(),
    onReset: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onReconnect: vi.fn(),
    onEndRun: vi.fn(),
  }
  const renderScreen = (
    nextReasons = reasons,
    nextCanResume = canResume,
    telemetryStatus: TelemetrySourceStatus = nextReasons.includes('disconnect')
      ? ({ state: 'disconnected' } as const)
      : ({ state: 'connected' } as const),
  ) => (
    <ActiveMissionScreen
      run={missionRun()}
      telemetryStatus={telemetryStatus}
      paused={paused}
      suspensionReasons={nextReasons}
      pageVisible
      canResume={nextCanResume}
      hintEligible
      hintRemainingMs={0}
      {...handlers}
    />
  )
  const view = render(renderScreen(reasons, canResume, initialTelemetryStatus))
  return {
    ...handlers,
    ...view,
    rerenderMission: (
      nextReasons: typeof reasons,
      nextCanResume: boolean,
      telemetryStatus?: TelemetrySourceStatus,
    ) =>
      view.rerender(renderScreen(nextReasons, nextCanResume, telemetryStatus)),
  }
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
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'End run' })).toHaveFocus()
    await user.tab()
    expect(resume).toHaveFocus()
    await user.click(resume)
    expect(onResume).toHaveBeenCalledOnce()
  })

  it('explains overlapping blockers and exposes reconnect and end-run actions without enabling resume', async () => {
    const user = userEvent.setup()
    const { onReconnect, onResume, onEndRun } = renderMission(
      true,
      ['hidden', 'disconnect', 'staleSignal'],
      false,
    )
    expect(
      screen.getByText(
        'The page was hidden. Mission time stopped immediately.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('The heart-rate monitor disconnected.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No fresh heart-rate signal is available.'),
    ).toBeInTheDocument()
    const reconnect = screen.getByRole('button', {
      name: 'Reconnect monitor',
    })
    expect(reconnect).toHaveFocus()
    await user.click(reconnect)
    expect(onReconnect).toHaveBeenCalledOnce()
    const resume = screen.getByRole('button', { name: 'Resume mission' })
    expect(resume).toHaveAttribute('aria-disabled', 'true')
    await user.click(resume)
    expect(onResume).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'End run' }))
    expect(onEndRun).toHaveBeenCalledOnce()
  })

  it('visibly associates a canonical telemetry error with the focused retry control', async () => {
    const user = userEvent.setup()
    const errorStatus = {
      state: 'error' as const,
      error: {
        code: 'connection-failed' as const,
        message: 'Move closer to the monitor and retry.',
      },
    }
    const { onReconnect } = renderMission(
      true,
      ['disconnect'],
      false,
      errorStatus,
    )
    const dialog = screen.getByRole('dialog', { name: 'Mission paused' })
    const retry = screen.getByRole('button', {
      name: 'Reconnect monitor',
    })
    const error = screen.getByText('Move closer to the monitor and retry.')
    expect(dialog).toBeVisible()
    expect(error).toBeVisible()
    expect(retry).toHaveAttribute('aria-describedby', error.id)
    expect(retry).toHaveFocus()
    expect(retry).toBeEnabled()
    await user.click(retry)
    expect(onReconnect).toHaveBeenCalledOnce()
    expect(retry).toHaveFocus()
    expect(dialog).toBeVisible()
  })

  it('focuses the interruption heading for an automatic visible-page pause', () => {
    renderMission(true, ['staleSignal'], false)
    expect(
      screen.getByRole('heading', { name: 'Mission paused' }),
    ).toHaveFocus()
  })

  it('hands reconnect focus to eligible Resume without moving it again on an unchanged rerender', () => {
    const { rerenderMission } = renderMission(true, ['disconnect'], false)
    const reconnect = screen.getByRole('button', {
      name: 'Reconnect monitor',
    })
    expect(reconnect).toHaveFocus()

    rerenderMission(['resumeRequired'], true)
    expect(reconnect).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume mission' })).toHaveFocus()
    expect(document.body).not.toHaveFocus()

    screen.getByRole('button', { name: 'End run' }).focus()
    rerenderMission(['resumeRequired'], true)
    expect(screen.getByRole('button', { name: 'End run' })).toHaveFocus()
  })

  it('hands reconnect focus to the stable heading while another blocker remains without overlap thrashing', () => {
    const { rerenderMission } = renderMission(
      true,
      ['disconnect', 'staleSignal'],
      false,
    )
    expect(
      screen.getByRole('button', { name: 'Reconnect monitor' }),
    ).toHaveFocus()

    rerenderMission(['staleSignal'], false)
    expect(
      screen.queryByRole('button', { name: 'Reconnect monitor' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Mission paused' }),
    ).toHaveFocus()
    expect(document.body).not.toHaveFocus()

    screen.getByRole('button', { name: 'End run' }).focus()
    rerenderMission(['staleSignal'], false, {
      state: 'error',
      error: { code: 'source-error', message: 'Retry failed' },
    })
    expect(screen.getByRole('button', { name: 'End run' })).toHaveFocus()
    rerenderMission(['manual', 'staleSignal'], false)
    expect(screen.getByRole('button', { name: 'End run' })).toHaveFocus()
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
