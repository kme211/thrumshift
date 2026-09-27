import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SimulatorOutputControl } from './SimulatorOutputControl'

describe('SimulatorOutputControl', () => {
  it('shows the current output and exposes three semantic presets', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<SimulatorOutputControl bpm={110} onSelect={onSelect} />)

    expect(
      screen.getByLabelText('Current simulated heart rate'),
    ).toHaveTextContent('110 BPM')
    expect(screen.getByRole('button', { name: 'Low 90 BPM' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(
      screen.getByRole('button', { name: 'In range 110 BPM' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: 'High 160 BPM' }),
    ).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'High 160 BPM' }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(160)
  })
})
