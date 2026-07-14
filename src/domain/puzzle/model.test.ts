import { describe, expect, it } from 'vitest'

import { reactorCoolingEasy } from './boards/reactorCoolingEasy'
import {
  adjacentCoordinate,
  createPuzzleState,
  createSolvedPuzzleState,
  hasReciprocalConnection,
  haveEquivalentOpenings,
  isPuzzleComplete,
  openingsFor,
  resetPuzzle,
  rotateDirection,
  rotateOrientation,
  rotateTile,
  selectPuzzleHint,
  sourceReachableTileIds,
  validateBoard,
} from './model'
import type { PuzzleBoard, PuzzleState } from './types'

const twoTileBoard: PuzzleBoard = {
  id: 'two',
  name: 'Two tiles',
  rows: 1,
  columns: 2,
  source: { row: 0, column: 0 },
  reactor: { row: 0, column: 1 },
  tiles: [
    {
      id: 'a',
      row: 0,
      column: 0,
      shape: 'endpoint',
      role: 'source',
      initialOrientation: 1,
      solutionOrientation: 1,
    },
    {
      id: 'b',
      row: 0,
      column: 1,
      shape: 'endpoint',
      role: 'reactor',
      initialOrientation: 3,
      solutionOrientation: 3,
    },
  ],
}

function withOrientations(
  board: PuzzleBoard,
  orientations: Record<string, 0 | 1 | 2 | 3>,
): PuzzleState {
  return { board, orientations }
}

describe('puzzle rotation', () => {
  it('rotates through all four orientations and returns after four rotations', () => {
    expect(
      [0, 1, 2, 3].map((value) => rotateOrientation(value as 0 | 1 | 2 | 3)),
    ).toEqual([1, 2, 3, 0])
    let state = createPuzzleState(twoTileBoard)
    const original = state.orientations.a
    for (let count = 0; count < 4; count += 1) state = rotateTile(state, 'a')
    expect(state.orientations.a).toBe(original)
  })

  it('transforms every cardinal direction clockwise', () => {
    expect(rotateDirection('north', 1)).toBe('east')
    expect(rotateDirection('east', 1)).toBe('south')
    expect(rotateDirection('south', 1)).toBe('west')
    expect(rotateDirection('west', 1)).toBe('north')
    expect(rotateDirection('north', 3)).toBe('west')
  })

  it('represents straight and corner openings explicitly', () => {
    expect(openingsFor('straight', 1)).toEqual(['east', 'west'])
    expect(openingsFor('corner', 2)).toEqual(['south', 'west'])
  })

  it('compares effective openings independent of raw orientation', () => {
    expect(
      haveEquivalentOpenings(
        openingsFor('straight', 1),
        openingsFor('straight', 3),
      ),
    ).toBe(true)
    expect(
      haveEquivalentOpenings(
        openingsFor('corner', 0),
        openingsFor('corner', 1),
      ),
    ).toBe(false)
  })
})

describe('puzzle connectivity', () => {
  it('handles board bounds and rejects off-board adjacency', () => {
    expect(
      adjacentCoordinate(twoTileBoard, { row: 0, column: 0 }, 'north'),
    ).toBeNull()
    expect(
      adjacentCoordinate(twoTileBoard, { row: 0, column: 0 }, 'east'),
    ).toEqual({ row: 0, column: 1 })
  })

  it('requires reciprocal openings and rejects a one-sided connection', () => {
    const valid = createSolvedPuzzleState(twoTileBoard)
    expect(hasReciprocalConnection(valid, twoTileBoard.tiles[0]!, 'east')).toBe(
      true,
    )
    const oneSided = withOrientations(twoTileBoard, { a: 1, b: 0 })
    expect(
      hasReciprocalConnection(oneSided, twoTileBoard.tiles[0]!, 'east'),
    ).toBe(false)
    expect(isPuzzleComplete(oneSided)).toBe(false)
  })

  it('stops at dead ends and does not treat a disconnected loop as reachable', () => {
    const board: PuzzleBoard = {
      id: 'loop',
      name: 'Loop scenario',
      rows: 2,
      columns: 3,
      source: { row: 0, column: 0 },
      reactor: { row: 1, column: 0 },
      tiles: [
        {
          id: 's',
          row: 0,
          column: 0,
          shape: 'endpoint',
          role: 'source',
          initialOrientation: 1,
          solutionOrientation: 2,
        },
        {
          id: 'c1',
          row: 0,
          column: 1,
          shape: 'corner',
          initialOrientation: 1,
          solutionOrientation: 2,
        },
        {
          id: 'c2',
          row: 0,
          column: 2,
          shape: 'corner',
          initialOrientation: 2,
          solutionOrientation: 2,
        },
        {
          id: 'r',
          row: 1,
          column: 0,
          shape: 'endpoint',
          role: 'reactor',
          initialOrientation: 0,
          solutionOrientation: 0,
        },
        {
          id: 'c4',
          row: 1,
          column: 1,
          shape: 'corner',
          initialOrientation: 0,
          solutionOrientation: 0,
        },
        {
          id: 'c3',
          row: 1,
          column: 2,
          shape: 'corner',
          initialOrientation: 3,
          solutionOrientation: 3,
        },
      ],
    }
    const state = withOrientations(board, {
      s: 1,
      c1: 1,
      c2: 2,
      r: 0,
      c4: 0,
      c3: 3,
    })
    expect(sourceReachableTileIds(state)).toEqual(new Set(['s']))
    expect(hasReciprocalConnection(state, board.tiles[1]!, 'south')).toBe(true)
    expect(isPuzzleComplete(state)).toBe(false)
  })

  it('finds the reactor only through the source-connected route', () => {
    const solved = createSolvedPuzzleState(reactorCoolingEasy)
    expect(sourceReachableTileIds(solved).size).toBe(9)
    expect(isPuzzleComplete(solved)).toBe(true)
    expect(isPuzzleComplete(rotateTile(solved, 'middle-straight'))).toBe(false)
  })
})

describe('board validation and authored board', () => {
  it('reports structural, endpoint, and invalid-solution invariants', () => {
    const invalid: PuzzleBoard = {
      ...twoTileBoard,
      tiles: [twoTileBoard.tiles[0]!, { ...twoTileBoard.tiles[0]! }],
    }
    const result = validateBoard(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Duplicate tile id: a.',
        'Duplicate tile coordinate: 0:0.',
        'Missing tile at 0:1.',
        'Reactor coordinate must identify the reactor tile.',
      ]),
    )
  })

  it('rejects off-board openings in a declared solution', () => {
    const invalid = {
      ...twoTileBoard,
      tiles: [
        { ...twoTileBoard.tiles[0]!, solutionOrientation: 0 as const },
        twoTileBoard.tiles[1]!,
      ],
    }
    expect(validateBoard(invalid).errors).toContain(
      'Declared solution does not connect source to reactor.',
    )
  })

  it.each(['source', 'reactor'] as const)(
    'rejects a %s role placed on a non-endpoint tile',
    (role) => {
      const tileIndex = role === 'source' ? 0 : 1
      const invalid: PuzzleBoard = {
        ...twoTileBoard,
        tiles: twoTileBoard.tiles.map((tile, index) =>
          index === tileIndex ? { ...tile, shape: 'straight' } : tile,
        ),
      }
      expect(validateBoard(invalid).errors).toContain(
        role === 'source'
          ? 'Source tile must use the endpoint shape.'
          : 'Reactor tile must use the endpoint shape.',
      )
    },
  )

  it('starts incomplete, has exactly three intended errors, and solves in three clockwise moves', () => {
    const initial = createPuzzleState(reactorCoolingEasy)
    expect(validateBoard(reactorCoolingEasy)).toEqual({
      valid: true,
      errors: [],
    })
    expect(isPuzzleComplete(initial)).toBe(false)
    const incorrect = reactorCoolingEasy.tiles.filter(
      (tile) => initial.orientations[tile.id] !== tile.solutionOrientation,
    )
    expect(incorrect.map((tile) => tile.id)).toEqual([
      'top-straight',
      'middle-corner-left',
      'bottom-straight',
    ])
    const solved = incorrect.reduce(
      (state, tile) => rotateTile(state, tile.id),
      initial,
    )
    expect(isPuzzleComplete(solved)).toBe(true)
  })

  it('resets deterministically and returns a deterministic useful hint only while incomplete', () => {
    const initial = createPuzzleState(reactorCoolingEasy)
    const changed = rotateTile(initial, 'source')
    expect(resetPuzzle(changed)).toEqual(initial)
    expect(selectPuzzleHint(initial)).toEqual({
      tileId: 'top-straight',
      row: 0,
      column: 1,
    })
    expect(
      selectPuzzleHint(createSolvedPuzzleState(reactorCoolingEasy)),
    ).toBeNull()
  })

  it('skips a rotationally equivalent straight instead of making it worse', () => {
    const initial = createPuzzleState(reactorCoolingEasy)
    const equivalentStraight: PuzzleState = {
      ...initial,
      orientations: {
        ...initial.orientations,
        'top-straight': 3,
      },
    }
    expect(openingsFor('straight', 3)).toEqual(['west', 'east'])
    expect(selectPuzzleHint(equivalentStraight)).toEqual({
      tileId: 'middle-corner-left',
      row: 1,
      column: 0,
    })
    expect(
      openingsFor('straight', equivalentStraight.orientations['top-straight']!),
    ).toEqual(expect.arrayContaining(['east', 'west']))
  })
})
