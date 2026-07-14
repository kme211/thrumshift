import type { Direction, PuzzleTile } from '../../domain/puzzle/types'

const DIRECTION_LABEL: Record<Direction, string> = {
  north: 'north',
  east: 'east',
  south: 'south',
  west: 'west',
}

const ENDPOINT_LABEL = { source: 'coolant source', reactor: 'reactor' } as const

function pipeEnd(direction: Direction): { x: number; y: number } {
  if (direction === 'north') return { x: 50, y: 0 }
  if (direction === 'east') return { x: 100, y: 50 }
  if (direction === 'south') return { x: 50, y: 100 }
  return { x: 0, y: 50 }
}

function coolantTileName(
  tile: PuzzleTile,
  openings: readonly Direction[],
  sourceConnected: boolean,
): string {
  const parts = [
    `Row ${tile.row + 1}, column ${tile.column + 1}`,
    tile.role === undefined ? `${tile.shape} pipe` : ENDPOINT_LABEL[tile.role],
    `open ${openings.map((direction) => DIRECTION_LABEL[direction]).join(' and ')}`,
  ]
  if (sourceConnected) parts.push('receiving coolant')
  return parts.join(', ')
}

export function CoolantTile({
  tile,
  openings,
  sourceConnected,
  hinted,
  rotationCount,
  onRotate,
}: {
  readonly tile: PuzzleTile
  readonly openings: readonly Direction[]
  readonly sourceConnected: boolean
  readonly hinted: boolean
  readonly rotationCount: number
  readonly onRotate: () => void
}) {
  const accessibleName = coolantTileName(tile, openings, sourceConnected)
  return (
    <button
      type="button"
      className="coolant-tile"
      aria-label={accessibleName}
      aria-describedby={hinted ? 'coolant-hint-status' : undefined}
      data-receiving-coolant={sourceConnected || undefined}
      data-hinted={hinted || undefined}
      onClick={onRotate}
    >
      <svg
        key={rotationCount}
        className="coolant-tile__graphic"
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
      >
        {openings.map((direction) => {
          const end = pipeEnd(direction)
          return (
            <g key={direction}>
              <line
                className="coolant-tile__pipe"
                x1="50"
                y1="50"
                x2={end.x}
                y2={end.y}
              />
              {sourceConnected ? (
                <line
                  className="coolant-tile__flow-pattern"
                  x1="50"
                  y1="50"
                  x2={end.x}
                  y2={end.y}
                />
              ) : null}
            </g>
          )
        })}
        <circle className="coolant-tile__junction" cx="50" cy="50" r="8" />
      </svg>
      {tile.role === undefined ? null : (
        <span className="coolant-tile__marker" aria-hidden="true">
          {tile.role === 'source' ? 'S' : 'R'}
        </span>
      )}
      {hinted ? (
        <span className="coolant-tile__hint" aria-hidden="true">
          Rotate
        </span>
      ) : null}
    </button>
  )
}
