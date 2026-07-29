import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StationStabilityMeter } from './StationStabilityMeter'

describe('StationStabilityMeter', () => {
  it('keeps exact visual updates outside live regions and coarsens the accessible meter snapshot', () => {
    const view = render(
      <StationStabilityMeter stability={72} behavior="activeAboveRange" />,
    )

    const visualValue = screen.getByText('72%')
    const meter = screen.getByRole('meter', { name: 'Station stability' })
    expect(visualValue).toHaveAttribute('aria-hidden', 'true')
    expect(
      visualValue.closest('[aria-live], [role="status"]'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: 'Station stability value' }),
    ).not.toBeInTheDocument()
    expect(meter).toHaveAttribute('aria-valuenow', '70')
    expect(meter).toHaveAttribute(
      'aria-valuetext',
      'Approximately 70 percent, decreasing',
    )
    expect(meter).not.toHaveAttribute('tabindex')

    view.rerender(
      <StationStabilityMeter stability={71} behavior="activeAboveRange" />,
    )
    expect(screen.getByText('71%')).toBeInTheDocument()
    expect(meter).toHaveAttribute('aria-valuenow', '70')
    expect(meter).toHaveAttribute(
      'aria-valuetext',
      'Approximately 70 percent, decreasing',
    )
    expect(view.container.querySelector('[aria-live]')).not.toBeInTheDocument()
  })

  it('keeps current approximate value and trend discoverable when holding or recovering', () => {
    const view = render(
      <StationStabilityMeter stability={68} behavior="activeOperational" />,
    )
    const meter = screen.getByRole('meter', { name: 'Station stability' })
    expect(meter).toHaveAttribute(
      'aria-valuetext',
      'Approximately 70 percent, recovering',
    )

    view.rerender(
      <StationStabilityMeter stability={100} behavior="activeOperational" />,
    )
    expect(meter).toHaveAttribute(
      'aria-valuetext',
      'Approximately 100 percent, holding',
    )
  })

  it('uses no timer, remounting key, or artificial text-mutation announcement trick', async () => {
    const source = await import('./StationStabilityMeter.tsx?raw')
    expect(source.default).not.toMatch(
      /setTimeout|setInterval|key=|zero-width|\u200B|\u200C|\u200D|\u2060/,
    )
  })
})
