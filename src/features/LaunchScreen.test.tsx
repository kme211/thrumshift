import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LaunchScreen } from './LaunchScreen'

describe('LaunchScreen', () => {
  it('presents the concise station directive and both launch paths', async () => {
    const user = userEvent.setup()
    const onRunSimulation = vi.fn()
    const onConnectBioLink = vi.fn()
    render(
      <LaunchScreen
        bluetoothCapability={{ supported: true }}
        onRunSimulation={onRunSimulation}
        onConnectBioLink={onConnectBioLink}
      />,
    )

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Stay in range. Keep the station alive.',
      }),
    ).toHaveFocus()
    expect(screen.getByText(/Heart-rate telemetry drives/)).toBeVisible()
    expect(
      screen.getByText('Compatible Bluetooth heart-rate monitor required.'),
    ).toBeVisible()
    expect(screen.queryByText(/HTTPS or localhost/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Run Simulation' }))
    await user.click(screen.getByRole('button', { name: 'Connect Bio-Link' }))
    expect(onRunSimulation).toHaveBeenCalledOnce()
    expect(onConnectBioLink).toHaveBeenCalledOnce()
  })

  it('keeps simulation available and explains an unavailable bio-link', () => {
    render(
      <LaunchScreen
        bluetoothCapability={{ supported: false, reason: 'unsupported' }}
        onRunSimulation={vi.fn()}
        onConnectBioLink={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Run Simulation' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Connect Bio-Link' }),
    ).toBeDisabled()
    expect(screen.getByText(/Chrome on Android/i)).toBeVisible()
  })
})
