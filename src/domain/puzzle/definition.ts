import {
  FITTING_IDS,
  PORT_IDS,
  type DefinitionValidation,
  type PublicSchematic,
  type PuzzleDefinition,
  type ValveId,
  type ValvePositions,
} from './types'

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

/** Published connections only; concealed endpoint assignments never belong here. */
export const COOLANT_SCHEMATIC: PublicSchematic = deepFreeze({
  ports: [...PORT_IDS],
  valves: {
    V1: { A: [{ from: 'S', to: 'V1.A' }], B: [{ from: 'S', to: 'V1.B' }] },
    V2: {
      I: [{ from: 'V2.p', to: 'V2.x' }],
      II: [{ from: 'V2.p', to: 'V2.y' }],
      III: [{ from: 'V2.q', to: 'V2.x' }],
    },
    V3: {
      u: [
        { from: 'V3.u', to: 'reactor' },
        { from: 'V3.v', to: 'return' },
      ],
      v: [
        { from: 'V3.v', to: 'reactor' },
        { from: 'V3.u', to: 'return' },
      ],
    },
  },
  candidateGroups: [
    { fittings: ['A', 'B'], first: ['V1.A', 'V1.B'], second: ['V2.p', 'V2.q'] },
    { fittings: ['C', 'D'], first: ['V2.x', 'V2.y'], second: ['V3.u', 'V3.v'] },
  ],
  oneWay: true,
})

export const DEFAULT_TRACE_BUDGET = 2

export function validPositions(positions: ValvePositions): boolean {
  return (Object.keys(COOLANT_SCHEMATIC.valves) as ValveId[]).every((valve) =>
    Object.hasOwn(COOLANT_SCHEMATIC.valves[valve], positions[valve]),
  )
}

function sameMembers(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((item) => actual.includes(item))
  )
}

export function validateDefinition(
  definition: PuzzleDefinition,
): DefinitionValidation {
  const errors: string[] = []
  const { schematic, fittings } = definition
  if (
    !Number.isSafeInteger(definition.traceBudget) ||
    definition.traceBudget < 0
  )
    errors.push('Trace budget must be a nonnegative safe integer.')
  if (!validPositions(definition.initialPositions))
    errors.push('Invalid initial valve positions.')
  if (!sameMembers(schematic.ports, PORT_IDS) || schematic.oneWay !== true)
    errors.push('Invalid public ports or one-way rule.')
  if (!sameMembers(Object.keys(schematic.valves), ['V1', 'V2', 'V3']))
    errors.push('Public valves must contain V1, V2 and V3 exactly once.')
  for (const valve of Object.keys(COOLANT_SCHEMATIC.valves) as ValveId[]) {
    const expected = COOLANT_SCHEMATIC.valves[valve]
    const actual = schematic.valves[valve]
    if (
      !actual ||
      !sameMembers(Object.keys(actual), Object.keys(expected)) ||
      Object.entries(expected).some(([position, edges]) => {
        const supplied = (
          actual as Record<string, readonly { from: string; to: string }[]>
        )[position]
        return (
          !supplied ||
          !sameMembers(
            supplied.map((edge) => `${edge.from}>${edge.to}`),
            edges.map((edge) => `${edge.from}>${edge.to}`),
          )
        )
      })
    )
      errors.push(`Invalid published connections for ${valve}.`)
  }
  if (
    schematic.candidateGroups.length !== 2 ||
    COOLANT_SCHEMATIC.candidateGroups.some((expected, index) => {
      const actual = schematic.candidateGroups[index]
      return (
        !actual ||
        !sameMembers(actual.fittings, expected.fittings) ||
        !sameMembers(actual.first, expected.first) ||
        !sameMembers(actual.second, expected.second)
      )
    })
  )
    errors.push('Invalid public candidate groups.')
  if (
    !sameMembers(
      fittings.map((fitting) => fitting.id),
      FITTING_IDS,
    )
  )
    errors.push('Fittings must contain A, B, C and D exactly once.')
  for (const group of COOLANT_SCHEMATIC.candidateGroups) {
    const first: string[] = []
    const second: string[] = []
    for (const fitting of fittings.filter((item) =>
      group.fittings.includes(item.id),
    )) {
      const forward =
        group.first.includes(fitting.from) && group.second.includes(fitting.to)
      const backward =
        group.second.includes(fitting.from) && group.first.includes(fitting.to)
      if (!forward && !backward)
        errors.push(`Invalid directed endpoints for fitting ${fitting.id}.`)
      else {
        first.push(forward ? fitting.from : fitting.to)
        second.push(forward ? fitting.to : fitting.from)
      }
    }
    if (!sameMembers(first, group.first) || !sameMembers(second, group.second))
      errors.push(
        `Fittings ${group.fittings.join('/')} must form an endpoint bijection.`,
      )
  }
  return { valid: errors.length === 0, errors }
}

export function assertValidDefinition(definition: PuzzleDefinition): void {
  const result = validateDefinition(definition)
  if (!result.valid)
    throw new Error(`Invalid puzzle definition: ${result.errors.join(' ')}`)
}
