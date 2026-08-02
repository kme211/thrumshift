import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  buildFailedMissionResult,
  buildMissionResult,
  buildSparseMissionResult,
} from '../../test/missionResultBuilder'
import { MissionResultPanel } from './MissionResultPanel'

describe('MissionResultPanel', () => {
  it('renders a successful result in logical semantic order', () => {
    const view = render(<MissionResultPanel result={buildMissionResult()} />)
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Mission successful',
    })
    expect(heading).toHaveFocus()
    expect(
      screen.getByRole('region', { name: 'Mission successful' }),
    ).toHaveAttribute('data-outcome', 'success')
    expect(screen.getByText('Completion time')).toBeInTheDocument()
    expect(screen.getByText('1:10')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('1 minute 10 seconds')).toHaveClass('sr-only')
    expect(screen.getByText('1 minute')).toHaveClass('sr-only')
    expect(screen.getByText('Controlled Finish')).toBeInTheDocument()
    expect(screen.getByText(/requires mission success/)).toBeVisible()
    expect(screen.getByText('Unclassified signal time')).toBeInTheDocument()
    expect(screen.getByText('Unusable signal time')).toBeInTheDocument()

    const headings = [...view.container.querySelectorAll('h1, h2')].map(
      ({ textContent }) => textContent,
    )
    expect(headings).toEqual([
      'Mission successful',
      'Mission overview',
      'Time in gameplay range',
      'Mission events',
      'Coolant routing',
      'Interruptions',
      'Performance rating',
    ])
  })

  it('renders failure in text without completion-time language', () => {
    render(<MissionResultPanel result={buildFailedMissionResult()} />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mission failed' }),
    ).toHaveFocus()
    expect(screen.getByText('Mission duration')).toBeVisible()
    expect(screen.queryByText('Completion time')).not.toBeInTheDocument()
    expect(screen.getAllByText('Incomplete').length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByRole('region', { name: 'Mission failed' }),
    ).toHaveAttribute('data-outcome', 'failure')
  })

  it('visibly explains sparse signal and suppresses unsupported claims', () => {
    render(<MissionResultPanel result={buildSparseMissionResult()} />)
    expect(
      screen.getByText(/usable signal data was insufficient/i),
    ).toBeVisible()
    expect(screen.queryByText('Average heart rate')).not.toBeInTheDocument()
    expect(screen.queryByText('Below range')).not.toBeInTheDocument()
    expect(screen.queryByText('Operational')).not.toBeInTheDocument()
    expect(screen.queryByText('Above range')).not.toBeInTheDocument()
    expect(screen.getByText('Peak heart rate')).toBeVisible()
    expect(screen.getByText('Completed', { selector: 'p' })).toBeVisible()
  })

  it.each([
    {
      name: 'both available',
      override: {},
      averageVisible: true,
      rangeVisible: true,
      explanation: null,
      rating: 'Controlled Finish',
    },
    {
      name: 'only range available',
      override: { averageBpm: null },
      averageVisible: false,
      rangeVisible: true,
      explanation: /insufficient for an average BPM\./i,
      rating: 'Controlled Finish',
    },
    {
      name: 'only average available',
      override: {
        belowRangePercentage: null,
        operationalPercentage: null,
        aboveRangePercentage: null,
      },
      averageVisible: true,
      rangeVisible: false,
      explanation: /insufficient for a range breakdown\./i,
      rating: 'Completed',
    },
    {
      name: 'neither available',
      override: {
        averageBpm: null,
        belowRangePercentage: null,
        operationalPercentage: null,
        aboveRangePercentage: null,
      },
      averageVisible: false,
      rangeVisible: false,
      explanation:
        /insufficient for both an average BPM and a range breakdown\./i,
      rating: 'Completed',
    },
  ])(
    'renders independent signal availability when $name',
    ({ override, averageVisible, rangeVisible, explanation, rating }) => {
      render(<MissionResultPanel result={buildMissionResult(override)} />)
      expect(screen.queryByText('Average heart rate') !== null).toBe(
        averageVisible,
      )
      expect(screen.queryByText('Below range') !== null).toBe(rangeVisible)
      expect(screen.queryByText('Operational') !== null).toBe(rangeVisible)
      expect(screen.queryByText('Above range') !== null).toBe(rangeVisible)
      if (explanation === null) {
        expect(
          screen.queryByText(/usable signal data was insufficient/i),
        ).not.toBeInTheDocument()
      } else {
        expect(screen.getByText(explanation)).toBeVisible()
      }
      expect(screen.getByText(rating, { selector: 'p' })).toBeVisible()
    },
  )

  it('uses a single-column base structure with wrapping-safe metric cells', () => {
    const view = render(<MissionResultPanel result={buildMissionResult()} />)
    expect(view.container.querySelectorAll('.min-w-0').length).toBeGreaterThan(
      0,
    )
    expect(
      view.container.querySelectorAll('.break-words').length,
    ).toBeGreaterThan(0)
  })
})
