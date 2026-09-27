import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('opens with the launch console and enters briefing through simulation', async () => {
    const user = userEvent.setup()
    const view = render(<App />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Stay in range. Keep the station alive.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/KESS SYSTEMS \/\/ THRUMSHIFT STATION 04/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Run Simulation' }))
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Reactor Cooling Failure',
      }),
    ).toHaveFocus()
    view.unmount()
  })
})
