import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { CoolantPuzzle } from './CoolantPuzzle'

function tileAt(row: number, column: number): HTMLButtonElement {
  return screen.getByRole('button', {
    name: new RegExp(`Row ${row}, column ${column},`),
  })
}

async function solve(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(tileAt(1, 2))
  await user.click(tileAt(2, 1))
  await user.click(tileAt(3, 2))
}

describe('CoolantPuzzle', () => {
  it('renders every tile as a semantic button with accurate accessible state', async () => {
    const user = userEvent.setup()
    render(<CoolantPuzzle />)
    const tiles = screen
      .getAllByRole('button')
      .filter((button) => button.classList.contains('coolant-tile'))
    expect(tiles).toHaveLength(9)
    const tile = tileAt(1, 2)
    expect(tile).toHaveAccessibleName(
      'Row 1, column 2, straight pipe, open north and south',
    )
    await user.click(tile)
    expect(tile).toHaveAccessibleName(
      'Row 1, column 2, straight pipe, open east and west, receiving coolant',
    )
    expect(tile).toHaveAttribute('data-receiving-coolant', 'true')
    expect(tile.querySelectorAll('.coolant-tile__flow-pattern')).toHaveLength(2)
    expect(tile.querySelector('.coolant-tile__flow')).not.toBeInTheDocument()
    expect(tile).not.toHaveTextContent('✓')
    const downstreamDeadEnd = tileAt(2, 2)
    expect(downstreamDeadEnd).toHaveAccessibleName(
      'Row 2, column 2, straight pipe, open east and west, receiving coolant',
    )
    expect(downstreamDeadEnd).toHaveAttribute('data-receiving-coolant', 'true')
    expect(
      downstreamDeadEnd.querySelectorAll('.coolant-tile__flow-pattern'),
    ).toHaveLength(2)
    expect(downstreamDeadEnd).not.toHaveTextContent('✓')
    expect(
      tileAt(3, 2).querySelector('.coolant-tile__flow-pattern'),
    ).not.toBeInTheDocument()
  })

  it('rotates by click, Enter, and Space while retaining focus', async () => {
    const user = userEvent.setup()
    render(<CoolantPuzzle />)
    const clickTile = tileAt(1, 2)
    await user.click(clickTile)
    expect(clickTile).toHaveFocus()

    const enterTile = tileAt(2, 1)
    enterTile.focus()
    await user.keyboard('{Enter}')
    expect(enterTile).toHaveFocus()
    expect(enterTile).toHaveAccessibleName(/open east and south/)

    const spaceTile = tileAt(3, 2)
    spaceTile.focus()
    await user.keyboard(' ')
    expect(spaceTile).toHaveFocus()
    expect(spaceTile).toHaveAccessibleName(/open east and west/)
  })

  it('announces completion once without chatter from later rotations', async () => {
    const user = userEvent.setup()
    const { container } = render(<CoolantPuzzle />)
    await solve(user)
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).toHaveTextContent(
      'Coolant route complete. Reactor flow restored.',
    )
    expect(
      screen.getByText('Route complete — source and reactor are connected.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
    for (let count = 0; count < 4; count += 1) await user.click(tileAt(1, 1))
    expect(liveRegion).toHaveTextContent(
      'Coolant route complete. Reactor flow restored.',
    )
  })

  it('marks one deterministic helpful tile and clears the hint after interaction', async () => {
    const user = userEvent.setup()
    render(<CoolantPuzzle />)
    await user.click(screen.getByRole('button', { name: 'Show hint' }))
    const hinted = tileAt(1, 2)
    expect(hinted).toHaveAttribute('data-hinted', 'true')
    expect(hinted).toHaveAccessibleDescription(/Hint: rotate row 1, column 2/)
    await user.click(hinted)
    expect(hinted).not.toHaveAttribute('data-hinted')
  })

  it('resets puzzle state deterministically', async () => {
    const user = userEvent.setup()
    render(<CoolantPuzzle />)
    await solve(user)
    await user.click(screen.getByRole('button', { name: 'Reset puzzle' }))
    expect(screen.getByText('Route incomplete.')).toBeInTheDocument()
    expect(tileAt(1, 2)).toHaveAccessibleName(
      'Row 1, column 2, straight pipe, open north and south',
    )
    expect(screen.getByRole('button', { name: 'Show hint' })).toBeEnabled()
  })

  it('uses native activation without drag or custom pointer gestures', () => {
    render(<CoolantPuzzle />)
    const tile = tileAt(1, 2)
    fireEvent.click(tile)
    expect(tile).toHaveAccessibleName(/open east and west/)
    expect(tile).not.toHaveAttribute('draggable')
  })
})
