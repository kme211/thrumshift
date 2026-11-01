import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  applyTrace,
  changeValvePosition,
  createPuzzleState,
  resetRouting,
  selectPlayerSafeView,
} from '../../domain/puzzle/model'
import { reactorCooling } from '../../domain/puzzle/reactorCooling'
import { CoolantDeductionControls } from './CoolantDeductionControls'

function setup(disabled = false) {
  const handlers = {
    onValveChange: vi.fn(),
    onTrace: vi.fn(),
    onReset: vi.fn(),
  }
  const state = createPuzzleState(reactorCooling)
  const view = render(
    <CoolantDeductionControls
      view={selectPlayerSafeView(reactorCooling, state)}
      disabled={disabled}
      {...handlers}
    />,
  )
  return {
    ...view,
    ...handlers,
    state,
    update: (next = state) =>
      view.rerender(
        <CoolantDeductionControls
          view={selectPlayerSafeView(reactorCooling, next)}
          disabled={disabled}
          {...handlers}
        />,
      ),
  }
}

describe('controlled coolant deduction adapter', () => {
  it('emits keyboard valve intents and renders positions only from the owner', async () => {
    const user = userEvent.setup()
    const { onValveChange, state, update } = setup()
    const v1 = screen.getByLabelText('V1 position')
    v1.focus()
    await user.selectOptions(v1, 'B')
    expect(onValveChange).toHaveBeenCalledWith('V1', 'B')
    expect(v1).toHaveValue('A')
    expect(v1).toHaveFocus()
    update(changeValvePosition(reactorCooling, state, 'V1', 'B'))
    expect(v1).toHaveValue('B')
    expect(screen.getByText('Experiment history (2)')).toBeVisible()
  })

  it('previews safely without spending and emits a targeted trace only on explicit action', async () => {
    const user = userEvent.setup()
    const { onTrace, onReset, state, update } = setup()
    const snapshot = JSON.stringify(state)
    await user.selectOptions(screen.getByLabelText('Trace target'), 'C')
    expect(
      screen.getByText(
        'Reveal fitting C and its direction. Cost: 1 trace charge.',
      ),
    ).toBeVisible()
    expect(onTrace).not.toHaveBeenCalled()
    expect(JSON.stringify(state)).toBe(snapshot)
    expect(screen.queryByText(/^Fitting C:/)).not.toBeInTheDocument()
    const trace = screen.getByRole('button', { name: 'Junction Trace' })
    trace.focus()
    await user.keyboard('{Enter}')
    expect(onTrace).toHaveBeenCalledWith('C')
    expect(screen.getByText('Trace charges: 2/2')).toBeVisible()
    const traced = applyTrace(reactorCooling, state, 'C')
    update(traced)
    expect(screen.getByText('Trace charges: 1/2')).toBeVisible()
    expect(screen.getByText('Fitting C: V3.u → V2.x')).toBeVisible()
    expect(trace).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Reset routing' }))
    expect(onReset).toHaveBeenCalledOnce()
    update(resetRouting(reactorCooling, traced))
    expect(screen.getByText('Trace charges: 1/2')).toBeVisible()
    expect(screen.getByText('Experiment history (2)')).toBeVisible()
  })

  it('disables unknown targets after expenditure while retaining all revealed discoveries', () => {
    const { state, update } = setup()
    update(
      applyTrace(reactorCooling, applyTrace(reactorCooling, state, 'A'), 'B'),
    )
    expect(screen.getByText('Trace charges: 0/2')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Junction Trace' }),
    ).toBeDisabled()
    expect(screen.getByText('Fitting A: V1.A → V2.q')).toBeVisible()
    expect(screen.getByText('Fitting B: V1.B → V2.p')).toBeVisible()
  })

  it('disables gameplay and selection controls while suspended', async () => {
    const user = userEvent.setup()
    const { onTrace, onReset, onValveChange } = setup(true)
    for (const select of screen.getAllByRole('combobox'))
      expect(select).toBeDisabled()
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
      await user.click(button)
    }
    expect(onTrace).not.toHaveBeenCalled()
    expect(onReset).not.toHaveBeenCalled()
    expect(onValveChange).not.toHaveBeenCalled()
    expect(
      within(screen.getByRole('group', { name: 'Flow readings' })).getByText(
        'reactor: NO FLOW',
      ),
    ).toBeVisible()
  })
})
