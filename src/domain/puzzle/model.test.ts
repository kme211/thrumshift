import { describe, expect, it } from 'vitest'
import { COOLANT_SCHEMATIC, deepFreeze, validateDefinition } from './definition'
import {
  applyTrace,
  changeValvePosition,
  createPuzzleState,
  isPuzzleComplete,
  observeBehavior,
  previewTrace,
  resetRouting,
  resolveActiveGraph,
  selectPlayerSafeView,
  sourceReachability,
  terminalDelivery,
} from './model'
import { reactorCooling } from './reactorCooling'
import type { PuzzleDefinition, PuzzleState, ValvePositions } from './types'

const fixture = reactorCooling
const rows: readonly [ValvePositions, readonly number[]][] = [
  [{ V1: 'A', V2: 'I', V3: 'u' }, [1, 0, 0, 0, 0]],
  [{ V1: 'A', V2: 'I', V3: 'v' }, [1, 0, 0, 0, 0]],
  [{ V1: 'A', V2: 'II', V3: 'u' }, [1, 0, 0, 0, 0]],
  [{ V1: 'A', V2: 'II', V3: 'v' }, [1, 0, 0, 0, 0]],
  [{ V1: 'A', V2: 'III', V3: 'u' }, [1, 1, 0, 0, 0]],
  [{ V1: 'A', V2: 'III', V3: 'v' }, [1, 1, 0, 0, 0]],
  [{ V1: 'B', V2: 'I', V3: 'u' }, [1, 1, 0, 0, 0]],
  [{ V1: 'B', V2: 'I', V3: 'v' }, [1, 1, 0, 0, 0]],
  [{ V1: 'B', V2: 'II', V3: 'u' }, [1, 0, 1, 1, 0]],
  [{ V1: 'B', V2: 'II', V3: 'v' }, [1, 0, 1, 0, 1]],
  [{ V1: 'B', V2: 'III', V3: 'u' }, [1, 0, 0, 0, 0]],
  [{ V1: 'B', V2: 'III', V3: 'v' }, [1, 0, 0, 0, 0]],
]

function solve(state: PuzzleState, definition = fixture): PuzzleState {
  return changeValvePosition(
    definition,
    changeValvePosition(
      definition,
      changeValvePosition(definition, state, 'V1', 'B'),
      'V2',
      'II',
    ),
    'V3',
    'v',
  )
}

function knowledge(state: PuzzleState) {
  return {
    discoveries: state.discoveries,
    chargesRemaining: state.traceBudget - state.tracesSpent,
  }
}

function cloneFixture(): PuzzleDefinition {
  return structuredClone(fixture)
}

describe('authored directed coolant graph', () => {
  it.each(rows)(
    'observes the complete literal oracle at %j',
    (positions, expected) => {
      const readings = observeBehavior(fixture, positions)
      expect(
        [
          readings.S,
          readings.X,
          readings.Y,
          readings.return,
          readings.reactor,
        ].map(Number),
      ).toEqual(expected)
      expect(
        isPuzzleComplete(fixture, { ...createPuzzleState(fixture), positions }),
      ).toBe(expected[4] === 1)
    },
  )

  it('enumerates all twelve distinct tuples with exactly one successful configuration', () => {
    const tuples = rows.map(([positions]) => JSON.stringify(positions))
    expect(rows).toHaveLength(12)
    expect(new Set(tuples).size).toBe(12)
    expect(
      rows
        .filter(([positions]) => observeBehavior(fixture, positions).reactor)
        .map(([positions]) => positions),
    ).toEqual([{ V1: 'B', V2: 'II', V3: 'v' }])
  })

  it('authors the four concealed directions and published valve connections exactly', () => {
    expect(fixture.fittings).toEqual([
      { id: 'A', from: 'V1.A', to: 'V2.q' },
      { id: 'B', from: 'V1.B', to: 'V2.p' },
      { id: 'C', from: 'V3.u', to: 'V2.x' },
      { id: 'D', from: 'V2.y', to: 'V3.v' },
    ])
    const graph = resolveActiveGraph(fixture, { V1: 'B', V2: 'II', V3: 'u' })
    expect(graph).toHaveLength(8)
    expect(graph).toEqual(
      expect.arrayContaining([
        { from: 'S', to: 'V1.B' },
        { from: 'V2.p', to: 'V2.y' },
        { from: 'V3.u', to: 'reactor' },
        { from: 'V3.v', to: 'return' },
      ]),
    )
  })

  it('cannot traverse C forward from a supplied X dead end', () => {
    for (const V3 of ['u', 'v'] as const) {
      const graph = resolveActiveGraph(fixture, { V1: 'B', V2: 'I', V3 })
      expect(graph).toContainEqual({ from: 'V3.u', to: 'V2.x' })
      expect(graph).not.toContainEqual({ from: 'V2.x', to: 'V3.u' })
      const reachable = sourceReachability(graph)
      expect([...reachable].sort()).toEqual(['S', 'V1.B', 'V2.p', 'V2.x'])
      expect(terminalDelivery(reachable)).toEqual({
        return: false,
        reactor: false,
      })
    }
  })

  it('traverses outgoing edges to a fixed point even with cycles and shuffled edges', () => {
    expect(
      [
        ...sourceReachability([
          { from: 'V2.x', to: 'S' },
          { from: 'V1.A', to: 'V2.x' },
          { from: 'S', to: 'V1.A' },
          { from: 'reactor', to: 'V2.x' },
        ]),
      ].sort(),
    ).toEqual(['S', 'V1.A', 'V2.x'])
  })

  it('derives completion from delivery for compatible fixtures rather than a winning tuple', () => {
    const altered = {
      ...fixture,
      fittings: fixture.fittings.map((fitting) =>
        fitting.id === 'C'
          ? { ...fitting, from: fitting.to, to: fitting.from }
          : fitting,
      ),
    }
    expect(validateDefinition(altered).valid).toBe(true)
    const state = changeValvePosition(
      altered,
      createPuzzleState(altered),
      'V1',
      'B',
    )
    expect(isPuzzleComplete(altered, state)).toBe(true)
    expect(isPuzzleComplete(fixture, state)).toBe(false)
  })
})

describe('experiments and routing state', () => {
  it('starts incomplete with an initial snapshot and fresh resources', () => {
    const state = createPuzzleState(fixture)
    expect(state).toEqual({
      positions: { V1: 'A', V2: 'I', V3: 'u' },
      adjustments: 0,
      discoveries: [],
      traceBudget: 2,
      tracesSpent: 0,
      observations: [
        {
          experiment: 1,
          action: { type: 'INITIAL' },
          positions: { V1: 'A', V2: 'I', V3: 'u' },
          readings: {
            S: true,
            X: false,
            Y: false,
            return: false,
            reactor: false,
          },
        },
      ],
    })
    expect(isPuzzleComplete(fixture, state)).toBe(false)
    expect(state).not.toHaveProperty('fittings')
    expect(state).not.toHaveProperty('definition')
  })

  it('records numbered snapshots only for different valid positions', () => {
    const initial = deepFreeze(createPuzzleState(fixture))
    for (const [valve, position] of [
      ['V4', 'A'],
      ['V1', 'C'],
      ['V2', 'toString'],
      ['__proto__', 'A'],
      ['V1', 'A'],
    ]) {
      expect(changeValvePosition(fixture, initial, valve!, position!)).toBe(
        initial,
      )
    }
    const changed = changeValvePosition(fixture, initial, 'V1', 'B')
    expect(changed.adjustments).toBe(1)
    expect(changed.observations).toHaveLength(2)
    expect(changed.observations[1]).toEqual({
      experiment: 2,
      action: { type: 'VALVE CHANGE', valve: 'V1', position: 'B' },
      positions: { V1: 'B', V2: 'I', V3: 'u' },
      readings: { S: true, X: true, Y: false, return: false, reactor: false },
    })
    expect(changed.observations[0]).toEqual(initial.observations[0])
    expect(changed.discoveries).toEqual([])
    expect(changed.tracesSpent).toBe(0)
    expect(initial.positions.V1).toBe('A')
  })

  it('retains return readings in history after selecting reactor delivery', () => {
    const returning = changeValvePosition(
      fixture,
      changeValvePosition(fixture, createPuzzleState(fixture), 'V1', 'B'),
      'V2',
      'II',
    )
    const delivered = changeValvePosition(
      fixture,
      deepFreeze(returning),
      'V3',
      'v',
    )
    expect(returning.observations.at(-1)?.readings).toEqual({
      S: true,
      X: false,
      Y: true,
      return: true,
      reactor: false,
    })
    expect(delivered.observations.at(-1)?.readings).toEqual({
      S: true,
      X: false,
      Y: true,
      return: false,
      reactor: true,
    })
    expect(delivered.observations.slice(0, -1)).toEqual(returning.observations)
    expect(
      isPuzzleComplete(
        fixture,
        changeValvePosition(fixture, delivered, 'V2', 'I'),
      ),
    ).toBe(false)
  })

  it('resets routing even when already initial, retaining expenditure, knowledge and counters', () => {
    const traced = applyTrace(
      fixture,
      applyTrace(fixture, createPuzzleState(fixture), 'A'),
      'C',
    )
    const completed = deepFreeze(solve(traced))
    const reset = resetRouting(fixture, completed)
    expect(reset.positions).toEqual(fixture.initialPositions)
    expect(reset.adjustments).toBe(3)
    expect(reset.discoveries).toEqual(completed.discoveries)
    expect(reset.tracesSpent).toBe(2)
    expect(reset.traceBudget).toBe(2)
    expect(reset.observations.slice(0, -1)).toEqual(completed.observations)
    expect(reset.observations.at(-1)).toEqual({
      experiment: 5,
      action: { type: 'ROUTING RESET' },
      positions: fixture.initialPositions,
      readings: observeBehavior(fixture, fixture.initialPositions),
    })
    const again = resetRouting(fixture, deepFreeze(reset))
    expect(again.observations.at(-1)?.experiment).toBe(6)
    expect(again.observations.at(-1)?.action.type).toBe('ROUTING RESET')
    expect(again.adjustments).toBe(3)
    expect(isPuzzleComplete(fixture, again)).toBe(false)
    expect(isPuzzleComplete(fixture, solve(again))).toBe(true)
    expect(createPuzzleState(fixture)).toEqual(createPuzzleState(fixture))
    expect(createPuzzleState(fixture).discoveries).toEqual([])
    expect(createPuzzleState(fixture).tracesSpent).toBe(0)
  })

  it('can solve without tracing, including a configured zero-charge start', () => {
    for (const traceBudget of [0, 2, 5]) {
      const definition = { ...fixture, traceBudget }
      const state = solve(deepFreeze(createPuzzleState(definition)), definition)
      expect(isPuzzleComplete(definition, state)).toBe(true)
      expect(state.tracesSpent).toBe(0)
      expect(state.discoveries).toEqual([])
      expect(state.traceBudget).toBe(traceBudget)
    }
  })
})

describe('Junction Trace', () => {
  it('reveals only the targeted endpoints and permitted direction for any fitting', () => {
    for (const fitting of fixture.fittings) {
      const initial = deepFreeze(createPuzzleState(fixture))
      const traced = applyTrace(fixture, initial, fitting.id)
      expect(traced.discoveries).toEqual([fitting])
      expect(traced.discoveries[0]).not.toBe(fitting)
      expect(traced.tracesSpent).toBe(1)
      expect(traced.positions).toEqual(initial.positions)
      expect(traced.observations).toEqual(initial.observations)
      expect(traced.adjustments).toBe(0)
      expect(observeBehavior(fixture, traced.positions)).toEqual(
        observeBehavior(fixture, initial.positions),
      )
      expect(applyTrace(fixture, traced, fitting.id)).toBe(traced)
    }
  })

  it('charges exactly twice; invalid, repeated and exhausted targets are identity no-ops', () => {
    const initial = createPuzzleState(fixture)
    for (const target of ['', 'E', 'V1.A', 'a', 'toString'])
      expect(applyTrace(fixture, initial, target)).toBe(initial)
    const one = applyTrace(fixture, initial, 'A')
    const two = deepFreeze(applyTrace(fixture, one, 'B'))
    expect(two.tracesSpent).toBe(2)
    expect(two.discoveries.map((item) => item.id)).toEqual(['A', 'B'])
    for (const target of ['A', 'B', 'C', 'D', 'invalid'])
      expect(applyTrace(fixture, two, target)).toBe(two)
    expect(previewTrace(fixture.schematic, knowledge(two), 'A').status).toBe(
      'known',
    )
    expect(previewTrace(fixture.schematic, knowledge(two), 'C')).toMatchObject({
      status: 'exhausted',
      cost: 0,
    })
    expect(isPuzzleComplete(fixture, solve(resetRouting(fixture, two)))).toBe(
      true,
    )
  })

  it('previews public scope and cost only, without selecting a useful target', () => {
    const info = deepFreeze(knowledge(createPuzzleState(fixture)))
    expect(previewTrace(COOLANT_SCHEMATIC, info, 'C')).toEqual({
      target: 'C',
      status: 'available',
      cost: 1,
      scope: {
        fittings: ['C', 'D'],
        first: ['V2.x', 'V2.y'],
        second: ['V3.u', 'V3.v'],
      },
    })
    expect(previewTrace(COOLANT_SCHEMATIC, info, 'no')).toEqual({
      target: null,
      status: 'invalid',
      cost: 0,
      scope: null,
    })
    expect(info).toEqual({ discoveries: [], chargesRemaining: 2 })
    const zero = createPuzzleState({ ...fixture, traceBudget: 0 })
    expect(applyTrace(fixture, zero, 'C')).toBe(zero)
  })
})

describe('player information boundary', () => {
  const alternate: PuzzleDefinition = {
    ...fixture,
    fittings: fixture.fittings.map((fitting) =>
      fitting.id === 'C' || fitting.id === 'D'
        ? { ...fitting, from: fitting.to, to: fitting.from }
        : fitting,
    ),
  }

  it('produces equal views and previews across compatible concealed fixtures before and after shared discovery', () => {
    expect(validateDefinition(alternate).valid).toBe(true)
    for (const target of [null, 'A'] as const) {
      const first = target
        ? applyTrace(fixture, createPuzzleState(fixture), target)
        : createPuzzleState(fixture)
      const second = target
        ? applyTrace(alternate, createPuzzleState(alternate), target)
        : createPuzzleState(alternate)
      expect(selectPlayerSafeView(fixture, first)).toEqual(
        selectPlayerSafeView(alternate, second),
      )
      for (const id of ['A', 'B', 'C', 'D', 'invalid']) {
        expect(previewTrace(fixture.schematic, knowledge(first), id)).toEqual(
          previewTrace(alternate.schematic, knowledge(second), id),
        )
      }
    }
  })

  it('projects an explicit detached allowlist, including nested history and discovered facts', () => {
    const state = applyTrace(fixture, createPuzzleState(fixture), 'A')
    const dirty = {
      ...state,
      fittings: fixture.fittings,
      secret: 'hidden-sentinel',
      positions: { ...state.positions, secret: 'hidden-sentinel' },
      observations: state.observations.map((observation) => ({
        ...observation,
        secret: 'hidden-sentinel',
        action: { ...observation.action, secret: 'hidden-sentinel' },
        readings: { ...observation.readings, secret: 'hidden-sentinel' },
      })),
      discoveries: state.discoveries.map((item) => ({
        ...item,
        secret: 'hidden-sentinel',
      })),
    }
    const definition = {
      ...fixture,
      secret: 'hidden-sentinel',
      schematic: {
        ...fixture.schematic,
        secret: 'hidden-sentinel',
        valves: {
          ...fixture.schematic.valves,
          V1: {
            ...fixture.schematic.valves.V1,
            A: [
              {
                ...fixture.schematic.valves.V1.A[0]!,
                secret: 'hidden-sentinel',
              },
            ],
          },
        },
      },
    }
    const view = selectPlayerSafeView(deepFreeze(definition), deepFreeze(dirty))
    expect(Object.keys(view).sort()).toEqual(
      [
        'schematic',
        'positions',
        'readings',
        'observations',
        'discoveries',
        'traceBudget',
        'tracesSpent',
        'chargesRemaining',
        'adjustments',
      ].sort(),
    )
    expect(view.discoveries).toEqual([{ id: 'A', from: 'V1.A', to: 'V2.q' }])
    expect(JSON.stringify(view)).not.toContain('hidden-sentinel')
    expect(view).not.toHaveProperty('fittings')
    expect(view).not.toHaveProperty('reachable')
    expect(view.schematic).not.toBe(fixture.schematic)
    expect(view.positions).not.toBe(state.positions)
    expect(view.observations[0]?.readings).not.toBe(
      state.observations[0]?.readings,
    )
    expect(view.discoveries[0]).not.toBe(state.discoveries[0])
  })

  it('deeply freezes every authored definition object', () => {
    const check = (value: unknown) => {
      if (value && typeof value === 'object') {
        expect(Object.isFrozen(value)).toBe(true)
        Object.values(value).forEach(check)
      }
    }
    check(fixture)
    expect(() => Object.assign(fixture.fittings[0]!, { to: 'V2.p' })).toThrow()
  })
})

describe('definition validation', () => {
  it('accepts the authored fixture and configurable nonnegative integer budgets', () => {
    expect(validateDefinition(fixture)).toEqual({ valid: true, errors: [] })
    for (const traceBudget of [0, 1, 2, Number.MAX_SAFE_INTEGER]) {
      expect(validateDefinition({ ...fixture, traceBudget }).valid).toBe(true)
    }
  })

  const malformed: readonly [
    string,
    (definition: PuzzleDefinition) => PuzzleDefinition,
  ][] = [
    ['negative budget', (d) => ({ ...d, traceBudget: -1 })],
    ['fractional budget', (d) => ({ ...d, traceBudget: 0.5 })],
    [
      'unsafe budget',
      (d) => ({ ...d, traceBudget: Number.MAX_SAFE_INTEGER + 1 }),
    ],
    ['NaN budget', (d) => ({ ...d, traceBudget: NaN })],
    ['infinite budget', (d) => ({ ...d, traceBudget: Infinity })],
    ['missing fitting', (d) => ({ ...d, fittings: d.fittings.slice(1) })],
    [
      'duplicate fitting',
      (d) => ({ ...d, fittings: [...d.fittings, d.fittings[0]!] }),
    ],
    [
      'unknown fitting',
      (d) => ({
        ...d,
        fittings: d.fittings.map((f) =>
          f.id === 'A' ? { ...f, id: 'E' as 'A' } : f,
        ),
      }),
    ],
    [
      'invalid port',
      (d) => ({
        ...d,
        fittings: d.fittings.map((f) =>
          f.id === 'A' ? { ...f, to: 'unknown' as 'V2.q' } : f,
        ),
      }),
    ],
    [
      'self edge',
      (d) => ({
        ...d,
        fittings: d.fittings.map((f) =>
          f.id === 'A' ? { ...f, to: f.from } : f,
        ),
      }),
    ],
    [
      'wrong endpoint group',
      (d) => ({
        ...d,
        fittings: d.fittings.map((f) =>
          f.id === 'A' ? { ...f, to: 'V3.u' } : f,
        ),
      }),
    ],
    [
      'duplicate first endpoint',
      (d) => ({
        ...d,
        fittings: d.fittings.map((f) =>
          f.id === 'A' ? { ...f, from: 'V1.B' } : f,
        ),
      }),
    ],
    [
      'duplicate second endpoint',
      (d) => ({
        ...d,
        fittings: d.fittings.map((f) =>
          f.id === 'A' ? { ...f, to: 'V2.p' } : f,
        ),
      }),
    ],
    [
      'invalid initial V1',
      (d) => ({
        ...d,
        initialPositions: { ...d.initialPositions, V1: 'C' as 'A' },
      }),
    ],
    [
      'invalid initial V2',
      (d) => ({
        ...d,
        initialPositions: { ...d.initialPositions, V2: 'IV' as 'I' },
      }),
    ],
    [
      'invalid initial V3',
      (d) => ({
        ...d,
        initialPositions: { ...d.initialPositions, V3: 'w' as 'u' },
      }),
    ],
    [
      'missing public port',
      (d) => ({
        ...d,
        schematic: { ...d.schematic, ports: d.schematic.ports.slice(1) },
      }),
    ],
    [
      'missing public group',
      (d) => ({ ...d, schematic: { ...d.schematic, candidateGroups: [] } }),
    ],
    [
      'incorrect published connection',
      (d) => ({
        ...d,
        schematic: {
          ...d.schematic,
          valves: {
            ...d.schematic.valves,
            V2: { ...d.schematic.valves.V2, I: [{ from: 'V2.x', to: 'V2.p' }] },
          },
        },
      }),
    ],
  ]
  it.each(malformed)(
    'rejects %s before initialization or graph traversal',
    (_label, change) => {
      const definition = change(cloneFixture())
      expect(validateDefinition(definition).valid).toBe(false)
      expect(validateDefinition(definition).errors.length).toBeGreaterThan(0)
      expect(() => createPuzzleState(definition)).toThrow(
        'Invalid puzzle definition',
      )
      expect(() =>
        resolveActiveGraph(definition, fixture.initialPositions),
      ).toThrow('Invalid puzzle definition')
    },
  )

  it('rejects invalid runtime valve positions before traversal', () => {
    expect(() =>
      resolveActiveGraph(fixture, { V1: 'bad' as 'A', V2: 'I', V3: 'u' }),
    ).toThrow('Invalid valve positions')
  })
})
