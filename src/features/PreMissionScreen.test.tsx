import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PreMissionScreen } from './PreMissionScreen'

function renderScreen(
  overrides: Partial<Parameters<typeof PreMissionScreen>[0]> = {},
) {
  const props: Parameters<typeof PreMissionScreen>[0] = {
    status: { state: 'disconnected' },
    capability: { supported: true },
    latestBpm: null,
    targetDraft: { lower: '100', upper: '140' },
    targetError: null,
    canBegin: false,
    showSourceSelector: false,
    selectedSource: 'bluetooth',
    onSelectSource: vi.fn(),
    onConnect: vi.fn(),
    onTargetChange: vi.fn(),
    onTargetCommit: vi.fn(),
    onBegin: vi.fn(),
    ...overrides,
  }
  render(<PreMissionScreen {...props} />)
  return props
}

describe('PreMissionScreen', () => {
  it('frames the incident as a reduced-staffing operational recovery', () => {
    renderScreen()
    expect(
      screen.getByText('INCIDENT CLASSIFICATION: ROUTINE OPERATIONAL RECOVERY'),
    ).toBeVisible()
    expect(
      screen.getByText(/Environmental Systems coverage remains under reduced/i),
    ).toBeVisible()
    expect(screen.getByText(/Restore local coolant flow/)).toBeVisible()
  })

  it('explains unsupported and insecure browser states clearly', () => {
    renderScreen({ capability: { supported: false, reason: 'unsupported' } })
    expect(screen.getByText(/unavailable in this browser/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /heart-rate monitor/i }),
    ).toBeDisabled()
  })

  it('starts connect and begin actions from native button gestures', async () => {
    const user = userEvent.setup()
    const props = renderScreen({
      canBegin: true,
      status: { state: 'connected' },
    })
    await user.click(
      screen.getByRole('button', { name: /choose heart-rate monitor/i }),
    )
    await user.click(screen.getByRole('button', { name: 'Begin Warm-Up' }))
    expect(props.onConnect).toHaveBeenCalledOnce()
    expect(props.onBegin).toHaveBeenCalledOnce()
  })

  it('supports keyboard target editing and exposes validation errors', async () => {
    const user = userEvent.setup()
    const onTargetChange = vi.fn()
    const onTargetCommit = vi.fn()
    renderScreen({
      targetError: 'Lower BPM must be less than upper BPM.',
      onTargetChange,
      onTargetCommit,
    })
    const lower = screen.getByRole('spinbutton', { name: 'lower BPM' })
    await user.clear(lower)
    await user.type(lower, '120')
    await user.tab()
    expect(onTargetChange).toHaveBeenCalled()
    expect(onTargetCommit).toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/must be less/i)
  })

  it('focuses the mission heading without announcing BPM as a live region', () => {
    renderScreen({ latestBpm: 112 })
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect(screen.getByLabelText('Latest heart rate')).not.toHaveAttribute(
      'aria-live',
    )
  })
})
