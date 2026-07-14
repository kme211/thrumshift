import {
  DIRECTIONS,
  type BoardValidationResult,
  type Coordinate,
  type Direction,
  type Orientation,
  type PuzzleBoard,
  type PuzzleHint,
  type PuzzleState,
  type PuzzleTile,
  type TileShape,
} from './types'

const BASE_OPENINGS: Record<TileShape, readonly Direction[]> = {
  endpoint: ['north'],
  straight: ['north', 'south'],
  corner: ['north', 'east'],
}

const DELTAS: Record<Direction, Coordinate> = {
  north: { row: -1, column: 0 },
  east: { row: 0, column: 1 },
  south: { row: 1, column: 0 },
  west: { row: 0, column: -1 },
}

export const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east',
}

export function rotateDirection(
  direction: Direction,
  orientation: Orientation,
): Direction {
  return DIRECTIONS[(DIRECTIONS.indexOf(direction) + orientation) % 4]!
}

export function rotateOrientation(orientation: Orientation): Orientation {
  return ((orientation + 1) % 4) as Orientation
}

export function openingsFor(
  shape: TileShape,
  orientation: Orientation,
): readonly Direction[] {
  return BASE_OPENINGS[shape].map((direction) =>
    rotateDirection(direction, orientation),
  )
}

export function haveEquivalentOpenings(
  first: readonly Direction[],
  second: readonly Direction[],
): boolean {
  return (
    first.length === second.length &&
    first.every((direction) => second.includes(direction))
  )
}

export function coordinateKey({ row, column }: Coordinate): string {
  return `${row}:${column}`
}

export function isInBounds(
  board: PuzzleBoard,
  { row, column }: Coordinate,
): boolean {
  return row >= 0 && row < board.rows && column >= 0 && column < board.columns
}

export function adjacentCoordinate(
  board: PuzzleBoard,
  coordinate: Coordinate,
  direction: Direction,
): Coordinate | null {
  const delta = DELTAS[direction]
  const adjacent = {
    row: coordinate.row + delta.row,
    column: coordinate.column + delta.column,
  }
  return isInBounds(board, adjacent) ? adjacent : null
}

export function tileAt(
  board: PuzzleBoard,
  coordinate: Coordinate,
): PuzzleTile | undefined {
  return board.tiles.find(
    (tile) => tile.row === coordinate.row && tile.column === coordinate.column,
  )
}

export function createPuzzleState(board: PuzzleBoard): PuzzleState {
  assertValidBoard(board)
  return {
    board,
    orientations: Object.fromEntries(
      board.tiles.map((tile) => [tile.id, tile.initialOrientation]),
    ),
  }
}

export function createSolvedPuzzleState(board: PuzzleBoard): PuzzleState {
  assertValidBoard(board)
  return {
    board,
    orientations: Object.fromEntries(
      board.tiles.map((tile) => [tile.id, tile.solutionOrientation]),
    ),
  }
}

export function resetPuzzle(state: PuzzleState): PuzzleState {
  return createPuzzleState(state.board)
}

export function rotateTile(state: PuzzleState, tileId: string): PuzzleState {
  const orientation = state.orientations[tileId]
  if (orientation === undefined) return state
  return {
    ...state,
    orientations: {
      ...state.orientations,
      [tileId]: rotateOrientation(orientation),
    },
  }
}

export function tileOpenings(
  state: PuzzleState,
  tile: PuzzleTile,
): readonly Direction[] {
  const orientation = state.orientations[tile.id]
  if (orientation === undefined)
    throw new Error(`Missing orientation for tile ${tile.id}.`)
  return openingsFor(tile.shape, orientation)
}

export function hasReciprocalConnection(
  state: PuzzleState,
  from: PuzzleTile,
  direction: Direction,
): boolean {
  if (!tileOpenings(state, from).includes(direction)) return false
  const adjacent = adjacentCoordinate(state.board, from, direction)
  if (adjacent === null) return false
  const neighbor = tileAt(state.board, adjacent)
  return (
    neighbor !== undefined &&
    tileOpenings(state, neighbor).includes(OPPOSITE_DIRECTION[direction])
  )
}

export function sourceReachableTileIds(
  state: PuzzleState,
): ReadonlySet<string> {
  const source = tileAt(state.board, state.board.source)
  if (source === undefined) return new Set()
  const visited = new Set<string>()
  const pending: PuzzleTile[] = [source]

  while (pending.length > 0) {
    const current = pending.shift()
    if (current === undefined || visited.has(current.id)) continue
    visited.add(current.id)
    for (const direction of tileOpenings(state, current)) {
      if (!hasReciprocalConnection(state, current, direction)) continue
      const adjacent = adjacentCoordinate(state.board, current, direction)
      const neighbor =
        adjacent === null ? undefined : tileAt(state.board, adjacent)
      if (neighbor !== undefined && !visited.has(neighbor.id))
        pending.push(neighbor)
    }
  }
  return visited
}

export function isPuzzleComplete(state: PuzzleState): boolean {
  const reactor = tileAt(state.board, state.board.reactor)
  if (reactor === undefined) return false
  return sourceReachableTileIds(state).has(reactor.id)
}

export function selectPuzzleHint(state: PuzzleState): PuzzleHint | null {
  if (isPuzzleComplete(state)) return null
  const tile = [...state.board.tiles]
    .sort((a, b) => a.row - b.row || a.column - b.column)
    .find((candidate) => {
      const orientation = state.orientations[candidate.id]
      if (orientation === undefined) return false
      return !haveEquivalentOpenings(
        openingsFor(candidate.shape, orientation),
        openingsFor(candidate.shape, candidate.solutionOrientation),
      )
    })
  return tile === undefined
    ? null
    : { tileId: tile.id, row: tile.row, column: tile.column }
}

export function validateBoard(board: PuzzleBoard): BoardValidationResult {
  const errors: string[] = []
  if (!Number.isInteger(board.rows) || board.rows <= 0)
    errors.push('Rows must be a positive integer.')
  if (!Number.isInteger(board.columns) || board.columns <= 0)
    errors.push('Columns must be a positive integer.')
  if (board.tiles.length !== board.rows * board.columns)
    errors.push('Board must contain exactly one tile per coordinate.')

  const ids = new Set<string>()
  const coordinates = new Set<string>()
  for (const tile of board.tiles) {
    if (ids.has(tile.id)) errors.push(`Duplicate tile id: ${tile.id}.`)
    ids.add(tile.id)
    const key = coordinateKey(tile)
    if (coordinates.has(key)) errors.push(`Duplicate tile coordinate: ${key}.`)
    coordinates.add(key)
    if (!isInBounds(board, tile))
      errors.push(`Tile ${tile.id} is outside the board.`)
    if (
      ![0, 1, 2, 3].includes(tile.initialOrientation) ||
      ![0, 1, 2, 3].includes(tile.solutionOrientation)
    )
      errors.push(`Tile ${tile.id} has an invalid orientation.`)
  }

  for (let row = 0; row < board.rows; row += 1) {
    for (let column = 0; column < board.columns; column += 1) {
      if (!coordinates.has(coordinateKey({ row, column })))
        errors.push(`Missing tile at ${row}:${column}.`)
    }
  }

  const source = tileAt(board, board.source)
  const reactor = tileAt(board, board.reactor)
  if (source?.role !== 'source')
    errors.push('Source coordinate must identify the source tile.')
  if (reactor?.role !== 'reactor')
    errors.push('Reactor coordinate must identify the reactor tile.')
  if (source?.shape !== 'endpoint')
    errors.push('Source tile must use the endpoint shape.')
  if (reactor?.shape !== 'endpoint')
    errors.push('Reactor tile must use the endpoint shape.')
  if (board.tiles.filter((tile) => tile.role === 'source').length !== 1)
    errors.push('Board must contain exactly one source.')
  if (board.tiles.filter((tile) => tile.role === 'reactor').length !== 1)
    errors.push('Board must contain exactly one reactor.')

  if (errors.length === 0) {
    const solved = {
      board,
      orientations: Object.fromEntries(
        board.tiles.map((tile) => [tile.id, tile.solutionOrientation]),
      ),
    }
    if (!isPuzzleComplete(solved))
      errors.push('Declared solution does not connect source to reactor.')
    for (const tile of board.tiles) {
      for (const direction of tileOpenings(solved, tile)) {
        if (!hasReciprocalConnection(solved, tile, direction))
          errors.push(
            `Solved tile ${tile.id} has an off-board or one-sided opening.`,
          )
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

export function assertValidBoard(board: PuzzleBoard): void {
  const result = validateBoard(board)
  if (!result.valid)
    throw new Error(`Invalid puzzle board: ${result.errors.join(' ')}`)
}
