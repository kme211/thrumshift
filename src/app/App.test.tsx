import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('renders the branded pre-mission gray box with a semantic screen heading', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Reactor Cooling Failure',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Thrumshift')).toBeInTheDocument()
    expect(
      screen.getByText('Stay in range. Keep the station alive.'),
    ).toBeInTheDocument()
  })
})
