import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TelemetryDiagnostics } from '../../app/TelemetryDiagnostics'
import { SimulatedHeartRateSource } from '../simulated/SimulatedHeartRateSource'
import type { BluetoothPort } from './bluetoothPorts'
import { WebBluetoothHeartRateSource } from './WebBluetoothHeartRateSource'

describe('TelemetryDiagnostics Web Bluetooth boundary', () => {
  it('starts the real chooser path only from its explicit button', async () => {
    const user = userEvent.setup()
    const simulatedSource = new SimulatedHeartRateSource({ now: () => 0 })
    const bluetooth: BluetoothPort = {
      requestDevice: vi.fn(),
    }
    const bluetoothSource = new WebBluetoothHeartRateSource(
      { isSecureContext: true, bluetooth },
      { now: () => 0 },
    )
    const connect = vi.spyOn(bluetoothSource, 'connect').mockResolvedValue()
    const view = render(
      <TelemetryDiagnostics
        simulatedSource={simulatedSource}
        bluetoothSource={bluetoothSource}
      />,
    )
    const diagnostics = within(view.container)

    expect(connect).not.toHaveBeenCalled()
    await user.click(diagnostics.getByRole('radio', { name: 'Web Bluetooth' }))
    expect(connect).not.toHaveBeenCalled()
    await user.click(
      diagnostics.getByRole('button', { name: 'Choose heart-rate monitor' }),
    )

    expect(connect).toHaveBeenCalledOnce()
  })
})
