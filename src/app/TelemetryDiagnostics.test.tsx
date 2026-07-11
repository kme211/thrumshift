import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { WebBluetoothHeartRateSource } from '../telemetry/bluetooth/WebBluetoothHeartRateSource'
import { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
import { TelemetryDiagnostics } from './TelemetryDiagnostics'

describe('TelemetryDiagnostics', () => {
  it('exercises simulated connect, sample, error, disconnect, and reconnect behavior', async () => {
    const user = userEvent.setup()
    const source = new SimulatedHeartRateSource({ now: () => 1_234 })
    const bluetoothSource = new WebBluetoothHeartRateSource(
      { isSecureContext: true },
      { now: () => 1_234 },
    )
    render(
      <TelemetryDiagnostics
        simulatedSource={source}
        bluetoothSource={bluetoothSource}
      />,
    )

    expect(screen.getByText('Status: disconnected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Connect simulator' }))
    expect(screen.getByText('Status: connected')).toBeInTheDocument()

    const bpmInput = screen.getByRole('spinbutton', { name: 'BPM' })
    const rrInput = screen.getByRole('spinbutton', { name: 'RR interval (ms)' })
    await user.clear(bpmInput)
    await user.type(bpmInput, '88')
    await user.clear(rrInput)
    await user.type(rrInput, '682')
    await user.click(screen.getByRole('button', { name: 'Emit sample' }))

    expect(screen.getByLabelText('Current heart rate')).toHaveTextContent(
      '88 BPM',
    )
    expect(screen.getByText('RR interval: 682 ms')).toBeInTheDocument()

    await user.clear(rrInput)
    await user.click(screen.getByRole('button', { name: 'Emit sample' }))
    expect(screen.getByText('RR interval: — ms')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Emit error' }))
    expect(
      screen.getByText('Status: error — Manual simulated source error'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(screen.getByText('Status: disconnected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Connect simulator' }))
    expect(screen.getByText('Status: connected')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Web Bluetooth' }))
    expect(
      screen.getByText(
        'Capability: Web Bluetooth is unavailable in this browser',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Choose heart-rate monitor' }),
    ).toBeDisabled()
  })
})
