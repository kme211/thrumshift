import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type {
  PageVisibility,
  PageVisibilityChange,
  PageVisibilityState,
} from '../platform/PageVisibility'
import type { ScreenWakeLock } from '../platform/ScreenWakeLock'
import { WebBluetoothHeartRateSource } from '../telemetry/bluetooth/WebBluetoothHeartRateSource'
import { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
import { AppFlow } from './AppFlow'

class FakeVisibility implements PageVisibility {
  private listener: ((change: PageVisibilityChange) => void) | null = null
  get hasSubscriber(): boolean {
    return this.listener !== null
  }
  getState(): PageVisibilityState {
    return 'visible'
  }
  subscribe(listener: (change: PageVisibilityChange) => void): () => void {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }
  emit(state: PageVisibilityState): void {
    this.listener?.({ state, occurredAt: 100 })
  }
}

function createWakeLock(): ScreenWakeLock {
  return {
    capability: { supported: true },
    setActive: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  }
}

function renderFlow() {
  const visibility = new FakeVisibility()
  const wakeLock = createWakeLock()
  const rendered = render(
    <AppFlow
      visibility={visibility}
      wakeLock={wakeLock}
      diagnostics={{
        simulatedSource: new SimulatedHeartRateSource({ now: () => 0 }),
        bluetoothSource: new WebBluetoothHeartRateSource(
          { isSecureContext: true },
          { now: () => 0 },
        ),
      }}
    />,
  )
  return { ...rendered, visibility, wakeLock }
}

describe('AppFlow', () => {
  it('uses the Gate 4A reducer to navigate every gray-box shell', async () => {
    const user = userEvent.setup()
    renderFlow()

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Reactor Cooling Failure',
      }),
    ).toHaveFocus()
    await user.click(
      await screen.findByRole('button', { name: 'Begin fake warm-up' }),
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Warm-up' }),
    ).toHaveFocus()
    await user.click(
      screen.getByRole('button', { name: 'Begin fake countdown' }),
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mission countdown' }),
    ).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Begin fake mission' }))
    await user.click(screen.getByRole('button', { name: 'Show fake success' }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mission successful' }),
    ).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Run again' }))
    await user.click(
      await screen.findByRole('button', { name: 'Begin fake warm-up' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Begin fake countdown' }),
    )
    await user.click(screen.getByRole('button', { name: 'Begin fake mission' }))
    await user.click(screen.getByRole('button', { name: 'Show fake failure' }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mission failed' }),
    ).toHaveFocus()
  })

  it('pauses on hidden, releases Wake Lock, and requires explicit mission resume', async () => {
    const user = userEvent.setup()
    const { visibility, wakeLock } = renderFlow()
    await user.click(
      await screen.findByRole('button', { name: 'Begin fake warm-up' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Begin fake countdown' }),
    )
    await user.click(screen.getByRole('button', { name: 'Begin fake mission' }))

    visibility.emit('hidden')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mission paused' }),
    ).toHaveFocus()
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(false)
    visibility.emit('visible')
    expect(
      await screen.findByRole('button', { name: 'Resume mission' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mission paused' }),
    ).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Resume mission' }))
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Reactor Cooling Failure',
      }),
    ).toHaveFocus()
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(true)
  })

  it('returns hidden countdown to a fresh warm-up shell without feature rules', async () => {
    const user = userEvent.setup()
    const { visibility } = renderFlow()
    await user.click(
      await screen.findByRole('button', { name: 'Begin fake warm-up' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Begin fake countdown' }),
    )
    visibility.emit('hidden')
    await screen.findByRole('heading', { level: 1, name: 'Mission paused' })
    visibility.emit('visible')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Warm-up' }),
    ).toHaveFocus()
    expect(screen.queryByText(/target range/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/signal quality/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /puzzle|rotate|hint/i }),
    ).not.toBeInTheDocument()
  })

  it('releases lifecycle subscriptions and Wake Lock intent on unmount', () => {
    const { unmount, visibility, wakeLock } = renderFlow()
    unmount()
    expect(visibility.hasSubscriber).toBe(false)
    expect(wakeLock.setActive).toHaveBeenLastCalledWith(false)
  })

  it.each(['warming', 'countdown'] as const)(
    'preserves an independent manual pause across hidden → visible during %s',
    async (phase) => {
      const user = userEvent.setup()
      const { visibility, wakeLock } = renderFlow()
      await user.click(
        await screen.findByRole('button', { name: 'Begin fake warm-up' }),
      )
      if (phase === 'countdown') {
        await user.click(
          screen.getByRole('button', { name: 'Begin fake countdown' }),
        )
      }
      await user.click(screen.getByRole('button', { name: 'Pause' }))

      visibility.emit('hidden')
      expect(await screen.findByText('hidden')).toBeInTheDocument()
      visibility.emit('visible')

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Mission paused',
        }),
      ).toHaveFocus()
      expect(
        await screen.findByRole('button', { name: 'Restart fake warm-up' }),
      ).toBeInTheDocument()
      expect(wakeLock.setActive).toHaveBeenLastCalledWith(false)
    },
  )
})
