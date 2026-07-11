import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('renders the branded gray box with semantic headings', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Thrumshift' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Stay in range. Keep the station alive.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Reactor Cooling Failure',
      }),
    ).toBeInTheDocument()
  })
})
