import { useRef, useState } from 'react'

import { reactorCoolingEasy } from '../../domain/puzzle/boards/reactorCoolingEasy'
import {
  createPuzzleState,
  isPuzzleComplete,
  resetPuzzle,
  rotateTile,
  selectPuzzleHint,
  sourceReachableTileIds,
  tileOpenings,
} from '../../domain/puzzle/model'
import type { PuzzleHint } from '../../domain/puzzle/types'
import { CoolantTile } from './CoolantTile'

export function CoolantPuzzle() {
  const [puzzle, setPuzzle] = useState(() =>
    createPuzzleState(reactorCoolingEasy),
  )
  const [hint, setHint] = useState<PuzzleHint | null>(null)
  const [rotationCounts, setRotationCounts] = useState<Record<string, number>>(
    {},
  )
  const [announcement, setAnnouncement] = useState('')
  const wasComplete = useRef(false)
  const completionAnnounced = useRef(false)
  const complete = isPuzzleComplete(puzzle)
  const reachable = sourceReachableTileIds(puzzle)

  function applyRotation(tileId: string): void {
    const next = rotateTile(puzzle, tileId)
    const nowComplete = isPuzzleComplete(next)
    setPuzzle(next)
    setHint(null)
    setRotationCounts((counts) => ({
      ...counts,
      [tileId]: (counts[tileId] ?? 0) + 1,
    }))
    if (nowComplete && !wasComplete.current && !completionAnnounced.current) {
      setAnnouncement('Coolant route complete. Reactor flow restored.')
      completionAnnounced.current = true
    }
    wasComplete.current = nowComplete
  }

  function showHint(): void {
    const nextHint = selectPuzzleHint(puzzle)
    setHint(nextHint)
    if (nextHint !== null)
      setAnnouncement(
        `Hint: rotate row ${nextHint.row + 1}, column ${nextHint.column + 1}.`,
      )
  }

  function reset(): void {
    setPuzzle((current) => resetPuzzle(current))
    setHint(null)
    setRotationCounts({})
    setAnnouncement('Puzzle reset.')
    wasComplete.current = false
    completionAnnounced.current = false
  }

  return (
    <section
      className="coolant-puzzle"
      aria-labelledby="coolant-puzzle-heading"
    >
      <h3 id="coolant-puzzle-heading" className="text-xl font-semibold">
        Coolant routing workbench
      </h3>
      <p
        id="coolant-puzzle-instructions"
        className="mt-2 text-sm text-[var(--color-text-muted)]"
      >
        Rotate each tile to make one continuous route from S, the source, to R,
        the reactor. Tap or click a tile, or focus it and press Enter or Space.
      </p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div
        className="coolant-board"
        role="group"
        aria-label="Three by three coolant-routing board"
        aria-describedby="coolant-puzzle-instructions coolant-hint-status"
      >
        {puzzle.board.tiles.map((tile) => (
          <CoolantTile
            key={tile.id}
            tile={tile}
            openings={tileOpenings(puzzle, tile)}
            sourceConnected={reachable.has(tile.id)}
            hinted={hint?.tileId === tile.id}
            rotationCount={rotationCounts[tile.id] ?? 0}
            onRotate={() => applyRotation(tile.id)}
          />
        ))}
      </div>
      <p id="coolant-hint-status" className="coolant-puzzle__status">
        {complete
          ? 'Route complete — source and reactor are connected.'
          : hint === null
            ? 'Route incomplete.'
            : `Hint: rotate row ${hint.row + 1}, column ${hint.column + 1}. The marked tile says Rotate.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={showHint} disabled={complete}>
          Show hint
        </button>
        <button type="button" onClick={reset}>
          Reset puzzle
        </button>
      </div>
    </section>
  )
}
