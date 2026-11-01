export const DIRECTIONS = ['north', 'east', 'south', 'west'] as const

export type Direction = (typeof DIRECTIONS)[number]
export type Orientation = 0 | 1 | 2 | 3
export type TileShape = 'endpoint' | 'straight' | 'corner'
export type EndpointRole = 'source' | 'reactor'

export interface Coordinate {
  readonly row: number
  readonly column: number
}

export interface PuzzleTile extends Coordinate {
  readonly id: string
  readonly shape: TileShape
  readonly role?: EndpointRole
  readonly initialOrientation: Orientation
  readonly solutionOrientation: Orientation
}

export interface PuzzleBoard {
  readonly id: string
  readonly name: string
  readonly rows: number
  readonly columns: number
  readonly tiles: readonly PuzzleTile[]
  readonly source: Coordinate
  readonly reactor: Coordinate
}

export interface PuzzleState {
  readonly board: PuzzleBoard
  readonly orientations: Readonly<Record<string, Orientation>>
}

export interface PuzzleHint extends Coordinate {
  readonly tileId: string
}

export interface BoardValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}
