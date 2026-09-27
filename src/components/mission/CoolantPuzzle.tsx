import { useEffect, useRef, useState } from 'react'

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
import type { PuzzleState } from '../../domain/puzzle/types'
import { CoolantTile } from './CoolantTile'

interface ControlledCoolantPuzzleProps {
  readonly puzzle: PuzzleState
  readonly hint: PuzzleHint | null
  readonly rotationCounts: Readonly<Record<string, number>>
  readonly disabled: boolean
  readonly complete: boolean
  readonly hintEligible: boolean
  readonly hintRemainingMs: number
  readonly onRotate: (tileId: string) => void
  readonly onHint: () => void
  readonly onReset: () => void
}

export function ControlledCoolantPuzzle({
  puzzle,
  hint,
  rotationCounts,
  disabled,
  complete,
  hintEligible,
  hintRemainingMs,
  onRotate,
  onHint,
  onReset,
}: ControlledCoolantPuzzleProps) {
  const reachable = sourceReachableTileIds(puzzle)
  const [announcement, setAnnouncement] = useState('')
  const wasHintEligible = useRef(hintEligible)
  const wasComplete = useRef(complete)
  const announcedHintKey = useRef<string | null>(null)
  const hintText = complete
    ? 'Route complete — source and reactor are connected.'
    : hint !== null
      ? `Hint: rotate row ${hint.row + 1}, column ${hint.column + 1}. The marked tile says Rotate.`
      : hintEligible
        ? 'Hint ready.'
        : `Hint available after ${Math.ceil(hintRemainingMs / 1_000)} more seconds of active play.`

  useEffect(() => {
    const hintKey =
      hint === null ? null : `${hint.tileId}:${hint.row}:${hint.column}`
    if (complete && !wasComplete.current) {
      setAnnouncement('Coolant route complete. Reactor flow restored.')
    } else if (hint !== null && hintKey !== announcedHintKey.current) {
      setAnnouncement(
        `Hint: rotate row ${hint.row + 1}, column ${hint.column + 1}.`,
      )
    } else if (hint === null && announcedHintKey.current !== null) {
      setAnnouncement('')
    } else if (hintEligible && !wasHintEligible.current) {
      setAnnouncement('Hint ready.')
    }
    if (hint === null) announcedHintKey.current = null
    else announcedHintKey.current = hintKey
    wasHintEligible.current = hintEligible
    wasComplete.current = complete
  }, [complete, hint, hintEligible])

  return (
    <section
      className="coolant-puzzle"
      aria-labelledby="coolant-puzzle-heading"
    >
      <h2 id="coolant-puzzle-heading" className="coolant-puzzle__heading">
        Coolant routing
      </h2>
      <p
        id="coolant-puzzle-instructions"
        className="coolant-puzzle__instructions"
      >
        Rotate tiles to make one continuous route from S, the source, to R, the
        reactor.
      </p>
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
            disabled={disabled || complete}
            onRotate={() => onRotate(tile.id)}
          />
        ))}
      </div>
      <p id="coolant-hint-status" className="coolant-puzzle__status">
        {hintText}
      </p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="coolant-puzzle__controls">
        <button
          className="equipment-button"
          type="button"
          onClick={onHint}
          disabled={disabled || complete || !hintEligible}
        >
          Request hint
        </button>
        <button
          className="equipment-button"
          type="button"
          onClick={onReset}
          disabled={disabled || complete}
        >
          Reset puzzle
        </button>
      </div>
    </section>
  )
}

/** Isolated workbench retained for the approved puzzle component contract. */
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
