import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SegmentedIndicatorBank } from './SegmentedIndicatorBank'

describe('SegmentedIndicatorBank', () => {
  it('renders ten persistent lamps with discrete lit and unlit states', () => {
    const view = render(
      <SegmentedIndicatorBank litSegments={4} tone="healthy" />,
    )
    const lamps = view.container.querySelectorAll(
      '.segmented-indicator-bank__lamp',
    )

    expect(lamps).toHaveLength(10)
    expect(
      view.container.querySelectorAll(
        '.segmented-indicator-bank__lamp[data-lit="true"]',
      ),
    ).toHaveLength(4)
    expect(
      view.container.querySelectorAll(
        '.segmented-indicator-bank__lamp[data-lit="false"]',
      ),
    ).toHaveLength(6)
    expect(view.container.firstElementChild).toHaveAttribute(
      'data-tone',
      'healthy',
    )
    expect(view.container.firstElementChild).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('clamps the discrete lamp count to the physical bank', () => {
    const view = render(
      <SegmentedIndicatorBank litSegments={14} tone="critical" />,
    )
    expect(
      view.container.querySelectorAll(
        '.segmented-indicator-bank__lamp[data-lit="true"]',
      ),
    ).toHaveLength(10)

    view.rerender(<SegmentedIndicatorBank litSegments={-2} tone="degraded" />)
    expect(
      view.container.querySelectorAll(
        '.segmented-indicator-bank__lamp[data-lit="true"]',
      ),
    ).toHaveLength(0)
  })
})
