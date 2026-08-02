import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { MonotonicClock } from '../platform/Clock'
import type {
  PageVisibility,
  PageVisibilityChange,
} from '../platform/PageVisibility'
import type { Scheduler } from '../platform/Scheduler'
import type { ScreenWakeLock } from '../platform/ScreenWakeLock'
import { WebBluetoothHeartRateSource } from '../telemetry/bluetooth/WebBluetoothHeartRateSource'
import { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
import { AppFlow } from './AppFlow'

class FakeVisibility implements PageVisibility {
  listener: ((change: PageVisibilityChange) => void) | null = null
  getState() {
    return 'visible' as const
  }
  subscribe(listener: (change: PageVisibilityChange) => void) {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }
  emit(state: 'visible' | 'hidden', occurredAt: number) {
    this.listener?.({ state, occurredAt })
  }
}

class FakeScheduler implements Scheduler {
  callback: ((time: number) => void) | null = null
  schedule(_delay: number, callback: (time: number) => void) {
    this.callback = callback
    return () => {
      if (this.callback === callback) this.callback = null
    }
  }
  cancelAll() {
    this.callback = null
  }
  wake(time: number) {
    const callback = this.callback
    this.callback = null
    callback?.(time)
  }
}

class FakeSimulatedTimers {
  callback: (() => void) | null = null
  setTimeout(callback: () => void) {
    this.callback = callback
    return callback
  }
  clearTimeout(handle: unknown) {
    if (this.callback === handle) this.callback = null
  }
  wake() {
    const callback = this.callback
    this.callback = null
    callback?.()
  }
}

function renderFlow(simulatedTimers = new FakeSimulatedTimers()) {
  let time = 0
  const clock: MonotonicClock = { now: () => time }
  const scheduler = new FakeScheduler()
  const visibility = new FakeVisibility()
  const wakeLock: ScreenWakeLock = {
    capability: { supported: true },
    setActive: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  }
  const simulatedSource = new SimulatedHeartRateSource(
    clock,
    'simulated-heart-rate',
    simulatedTimers,
  )
  const view = render(
    <AppFlow
      clock={clock}
      scheduler={scheduler}
      visibility={visibility}
      wakeLock={wakeLock}
      simulatedSource={simulatedSource}
      bluetoothSource={
        new WebBluetoothHeartRateSource({ isSecureContext: true }, clock)
      }
    />,
  )
  return {
    simulatedSource,
    simulatedTimers,
    view,
    scheduler,
    visibility,
    wakeLock,
    setTime(next: number) {
      time = next
    },
  }
}

async function enterActiveFlow(
  flow: ReturnType<typeof renderFlow>,
): Promise<void> {
  await act(() => flow.simulatedSource.connect())
  fireEvent.click(screen.getByRole('button', { name: 'Begin Warm-Up' }))
  for (const time of [
    0, 500, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000,
    10_000, 11_000, 12_000, 13_000,
  ]) {
    flow.setTime(time)
    act(() => flow.simulatedSource.emitSample(110))
  }
  flow.setTime(16_000)
  await act(() => flow.scheduler.wake(16_000))
  expect(
    await screen.findByRole('heading', {
      level: 1,
      name: 'Reactor Cooling Failure',
    }),
  ).toBeInTheDocument()
  expect(screen.getByText('Active mission')).toBeInTheDocument()
}

describe('AppFlow pre-mission and warm-up integration', () => {
  it('keeps source-owned continuous samples running across screen transitions', async () => {
    const { simulatedSource, simulatedTimers, setTime } = renderFlow()
    await act(() => simulatedSource.connect())
    act(() => simulatedSource.startContinuousSamples(110, 1_095))
    fireEvent.click(screen.getByRole('button', { name: 'Begin Warm-Up' }))
    setTime(1_095)
    act(() => simulatedTimers.wake())
    expect(await screen.findByLabelText('Latest heart rate')).toHaveTextContent(
      '110',
    )
    expect(simulatedSource.getContinuousEmissionState().running).toBe(true)
    simulatedSource.stopContinuousSamples()
  })

  it('lets Stop Samples produce normal stale-signal suspension', async () => {
    const { scheduler, setTime, simulatedSource, simulatedTimers } =
      renderFlow()
    await act(() => simulatedSource.connect())
    fireEvent.click(screen.getByRole('button', { name: 'Begin Warm-Up' }))
    act(() => simulatedSource.startContinuousSamples(110, 1_000))
    for (const time of [1_000, 2_000]) {
      setTime(time)
      act(() => simulatedTimers.wake())
    }
    simulatedSource.stopContinuousSamples()
    setTime(5_001)
    await act(() => scheduler.wake(5_001))
    expect(await screen.findByText('staleSignal')).toBeInTheDocument()
  })

  it('stops continuous emission on application composition teardown', async () => {
    const { simulatedSource, simulatedTimers, view } = renderFlow()
    await act(() => simulatedSource.connect())
    act(() => simulatedSource.startContinuousSamples(110, 1_000))
    view.unmount()
    simulatedTimers.wake()
    expect(simulatedSource.getContinuousEmissionState().running).toBe(false)
  })
  it('connects through the telemetry contract and distinguishes latest BPM from pending gameplay status', async () => {
    const user = userEvent.setup()
    const { simulatedSource, setTime } = renderFlow()
    await user.click(screen.getByRole('button', { name: 'Connect simulator' }))
    await user.click(screen.getByRole('button', { name: 'Begin Warm-Up' }))
    setTime(100)
    simulatedSource.emitSample(110)
    expect(await screen.findByLabelText('Latest heart rate')).toHaveTextContent(
      '110',
    )
    expect(screen.getByText(/Unusable signal/)).toBeInTheDocument()
  })

  it('resets on hidden state and returns to fresh warm-up on visibility recovery', async () => {
    const user = userEvent.setup()
    const { visibility } = renderFlow()
    await user.click(screen.getByRole('button', { name: 'Connect simulator' }))
    await user.click(screen.getByRole('button', { name: 'Begin Warm-Up' }))
    visibility.emit('hidden', 100)
    expect(
      await screen.findByRole('heading', { name: 'Mission paused' }),
    ).toBeInTheDocument()
    visibility.emit('visible', 200)
    expect(
      await screen.findByRole('heading', { name: 'Warm-up' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/0 of 10 seconds/)).toBeInTheDocument()
  })

  it('offers a reconnect gesture and safe return after warm-up disconnect', async () => {
    const user = userEvent.setup()
    const { simulatedSource } = renderFlow()
    const connect = vi.spyOn(simulatedSource, 'connect')
    await user.click(screen.getByRole('button', { name: 'Connect simulator' }))
    await user.click(screen.getByRole('button', { name: 'Begin Warm-Up' }))
    await act(() => simulatedSource.disconnect())

    expect(
      await screen.findByRole('heading', { name: 'Connection interrupted' }),
    ).toHaveFocus()
    expect(
      screen.getByRole('button', { name: 'Reconnect heart-rate monitor' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Return to briefing' }),
    ).toBeInTheDocument()

    const callsBeforeReconnect = connect.mock.calls.length
    await user.click(
      screen.getByRole('button', { name: 'Reconnect heart-rate monitor' }),
    )
    expect(connect).toHaveBeenCalledTimes(callsBeforeReconnect + 1)
    expect(
      await screen.findByRole('heading', { name: 'Warm-up' }),
    ).toHaveFocus()
    expect(screen.getByText(/0 of 10 seconds/)).toBeInTheDocument()
  })

  it('suspends stale warm-up and releases Wake Lock', async () => {
    const user = userEvent.setup()
    const { scheduler, setTime, simulatedSource, wakeLock } = renderFlow()
    await user.click(screen.getByRole('button', { name: 'Connect simulator' }))
    await user.click(screen.getByRole('button', { name: 'Begin Warm-Up' }))
    for (const time of [0, 1_000, 2_000]) {
      setTime(time)
      await act(() => simulatedSource.emitSample(110))
    }
    await act(() => scheduler.wake(5_000))

    expect(
      await screen.findByRole('heading', { name: 'Mission paused' }),
    ).toHaveFocus()
    expect(screen.getByText('staleSignal')).toBeInTheDocument()
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(false)
  })

  it('keeps diagnostics in one development entry and removes fake lifecycle controls', async () => {
    const { simulatedSource } = renderFlow()
    await act(() => simulatedSource.connect())
    expect(
      await screen.findByRole('heading', { name: 'Development diagnostics' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /fake warm-up/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Export diagnostic log' }),
    ).toBeEnabled()
    expect(
      screen.getByText(/Diagnostic events captured: [1-9]/),
    ).toBeInTheDocument()
  })

  it('unsubscribes visibility on unmount', () => {
    const visibility = new FakeVisibility()
    let time = 0
    const clock = { now: () => time }
    const scheduler = new FakeScheduler()
    const view = render(
      <AppFlow
        clock={clock}
        scheduler={scheduler}
        visibility={visibility}
        wakeLock={{
          capability: { supported: true },
          setActive: async () => undefined,
          dispose: async () => undefined,
        }}
        simulatedSource={null}
        bluetoothSource={
          new WebBluetoothHeartRateSource({ isSecureContext: true }, clock)
        }
      />,
    )
    expect(visibility.listener).not.toBeNull()
    view.unmount()
    expect(visibility.listener).toBeNull()
    time = 1
  })

  it('releases Wake Lock for active interruption and reacquires only after a valid explicit resume', async () => {
    const flow = renderFlow()
    await enterActiveFlow(flow)
    for (let time = 17_000; time <= 22_000; time += 1_000) {
      flow.setTime(time)
      act(() => flow.simulatedSource.emitSample(110))
    }
    expect(flow.wakeLock.setActive).toHaveBeenLastCalledWith(true)
    flow.setTime(23_000)
    fireEvent.click(screen.getByRole('button', { name: 'Pause mission' }))
    expect(flow.wakeLock.setActive).toHaveBeenLastCalledWith(false)

    const resume = screen.getByRole('button', { name: 'Resume mission' })
    expect(resume).toHaveAttribute('aria-disabled', 'true')
    for (let time = 24_000; time <= 29_000; time += 1_000) {
      flow.setTime(time)
      act(() => flow.simulatedSource.emitSample(110))
    }
    expect(resume).toHaveAttribute('aria-disabled', 'false')
    flow.setTime(29_500)
    fireEvent.click(resume)
    expect(flow.wakeLock.setActive).toHaveBeenLastCalledWith(true)
  })

  it('releases active-mission Wake Lock on hidden suspension', async () => {
    const flow = renderFlow()
    await enterActiveFlow(flow)
    for (let time = 17_000; time <= 22_000; time += 1_000) {
      flow.setTime(time)
      act(() => flow.simulatedSource.emitSample(110))
    }
    expect(flow.wakeLock.setActive).toHaveBeenLastCalledWith(true)
    flow.setTime(23_000)
    act(() => flow.visibility.emit('hidden', 23_000))
    expect(flow.wakeLock.setActive).toHaveBeenLastCalledWith(false)
  })

  it('releases active-mission Wake Lock on exact stale suspension', async () => {
    const flow = renderFlow()
    await enterActiveFlow(flow)
    for (let time = 17_000; time <= 22_000; time += 1_000) {
      flow.setTime(time)
      act(() => flow.simulatedSource.emitSample(110))
    }
    expect(flow.wakeLock.setActive).toHaveBeenLastCalledWith(true)
    flow.setTime(25_000)
    await act(() => flow.scheduler.wake(25_000))
    expect(
      screen.getByText('No fresh heart-rate signal is available.'),
    ).toBeInTheDocument()
    expect(flow.wakeLock.setActive).toHaveBeenLastCalledWith(false)
  })

  it('releases active-mission Wake Lock on disconnect suspension', async () => {
    const flow = renderFlow()
    await enterActiveFlow(flow)
    for (let time = 17_000; time <= 22_000; time += 1_000) {
      flow.setTime(time)
      act(() => flow.simulatedSource.emitSample(110))
    }
    expect(flow.wakeLock.setActive).toHaveBeenLastCalledWith(true)
    flow.setTime(23_000)
    await act(() => flow.simulatedSource.disconnect())
    expect(flow.wakeLock.setActive).toHaveBeenLastCalledWith(false)
  })

  it('initiates reconnect only from the interruption button and retains the puzzle', async () => {
    const user = userEvent.setup()
    const flow = renderFlow()
    await enterActiveFlow(flow)
    for (let time = 17_000; time <= 22_000; time += 1_000) {
      flow.setTime(time)
      act(() => flow.simulatedSource.emitSample(110))
    }
    const tile = screen.getByRole('button', { name: /Row 1, column 2/ })
    await user.click(tile)
    const retainedOrientation = tile.getAttribute('aria-label')
    const connect = vi.spyOn(flow.simulatedSource, 'connect')
    const callsBefore = connect.mock.calls.length

    flow.setTime(23_000)
    await act(() => flow.simulatedSource.disconnect())
    expect(connect).toHaveBeenCalledTimes(callsBefore)
    const reconnect = screen.getByRole('button', {
      name: 'Reconnect monitor',
    })
    expect(reconnect).toHaveFocus()
    await user.click(reconnect)
    expect(connect).toHaveBeenCalledTimes(callsBefore + 1)
    expect(
      screen.queryByRole('button', { name: 'Reconnect monitor' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Mission paused' }),
    ).toHaveFocus()
    expect(document.body).not.toHaveFocus()
    expect(tile).toHaveAttribute('aria-label', retainedOrientation!)
    expect(
      screen.getByRole('button', { name: 'Resume mission' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('keeps a failed reconnect suspended with a stable retry action and error status', async () => {
    const user = userEvent.setup()
    const flow = renderFlow()
    await enterActiveFlow(flow)
    for (let time = 17_000; time <= 22_000; time += 1_000) {
      flow.setTime(time)
      act(() => flow.simulatedSource.emitSample(110))
    }
    flow.setTime(23_000)
    await act(() => flow.simulatedSource.disconnect())
    const reconnect = screen.getByRole('button', {
      name: 'Reconnect monitor',
    })
    expect(reconnect).toHaveFocus()
    const connect = vi
      .spyOn(flow.simulatedSource, 'connect')
      .mockImplementation(async () => {
        flow.simulatedSource.emitError('Reconnect failed')
      })
    const callsBeforeRetry = connect.mock.calls.length

    flow.setTime(24_000)
    await user.click(reconnect)
    const dialog = screen.getByRole('dialog', { name: 'Mission paused' })
    expect(dialog).toBeVisible()
    expect(reconnect).toBeVisible()
    expect(reconnect).toHaveFocus()
    expect(reconnect).toBeEnabled()
    expect(screen.getByLabelText('Bio-link status')).toHaveTextContent(
      'Bio-link: error; signal insufficient',
    )
    expect(within(dialog).getByText('Reconnect failed')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Resume mission' }),
    ).toHaveAttribute('aria-disabled', 'true')
    const announcement = document.querySelector('[aria-live="polite"]')
    expect(announcement).toHaveTextContent('Reconnect failed')
    const announcedText = announcement?.textContent

    act(() => flow.simulatedSource.emitError('Reconnect failed'))
    expect(announcement).toHaveTextContent(announcedText!)
    expect(reconnect).toHaveFocus()

    await user.click(reconnect)
    expect(connect).toHaveBeenCalledTimes(callsBeforeRetry + 2)
    expect(reconnect).toHaveFocus()
    expect(dialog).toBeVisible()
  })
})
