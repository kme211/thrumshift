import { assertValidDefinition, validPositions } from './definition'
import {
  type BehavioralObservation,
  type BehavioralReadings,
  type CandidateGroup,
  type DirectedEdge,
  type FittingId,
  type ObservationAction,
  type PlayerSafeView,
  type PortId,
  type PublicSchematic,
  type PuzzleDefinition,
  type PuzzleState,
  type StructuralDiscovery,
  type TraceKnowledge,
  type TracePreview,
  type ValveId,
  type ValvePositions,
} from './types'

/** Resolves directed edges, never reciprocal openings. No private edges enter state. */
export function resolveActiveGraph(
  definition: PuzzleDefinition,
  positions: ValvePositions,
): readonly DirectedEdge[] {
  assertValidDefinition(definition)
  if (!validPositions(positions)) throw new Error('Invalid valve positions.')
  return [
    ...definition.schematic.valves.V1[positions.V1],
    ...definition.schematic.valves.V2[positions.V2],
    ...definition.schematic.valves.V3[positions.V3],
    ...definition.fittings,
  ].map(({ from, to }) => ({ from, to }))
}

export function sourceReachability(
  graph: readonly DirectedEdge[],
): ReadonlySet<PortId> {
  const visited = new Set<PortId>()
  const pending: PortId[] = ['S']
  while (pending.length > 0) {
    const port = pending.pop()!
    if (visited.has(port)) continue
    visited.add(port)
    for (const edge of graph) {
      if (edge.from === port && !visited.has(edge.to)) pending.push(edge.to)
    }
  }
  return visited
}

export function terminalDelivery(
  reachable: ReadonlySet<PortId>,
): Pick<BehavioralReadings, 'return' | 'reactor'> {
  return { return: reachable.has('return'), reactor: reachable.has('reactor') }
}

export function observeBehavior(
  definition: PuzzleDefinition,
  positions: ValvePositions,
): BehavioralReadings {
  const reachable = sourceReachability(
    resolveActiveGraph(definition, positions),
  )
  return {
    S: reachable.has('S'),
    X: reachable.has('V2.x'),
    Y: reachable.has('V2.y'),
    ...terminalDelivery(reachable),
  }
}

export function isPuzzleComplete(
  definition: PuzzleDefinition,
  state: PuzzleState,
): boolean {
  return observeBehavior(definition, state.positions).reactor
}

function copyPositions(positions: ValvePositions): ValvePositions {
  return { V1: positions.V1, V2: positions.V2, V3: positions.V3 }
}

function recordObservation(
  definition: PuzzleDefinition,
  positions: ValvePositions,
  experiment: number,
  action: ObservationAction,
): BehavioralObservation {
  return {
    experiment,
    action,
    positions: copyPositions(positions),
    readings: observeBehavior(definition, positions),
  }
}

export function createPuzzleState(definition: PuzzleDefinition): PuzzleState {
  assertValidDefinition(definition)
  const positions = copyPositions(definition.initialPositions)
  return {
    positions,
    observations: [
      recordObservation(definition, positions, 1, { type: 'INITIAL' }),
    ],
    discoveries: [],
    traceBudget: definition.traceBudget,
    tracesSpent: 0,
    adjustments: 0,
  }
}

/** Unknown controls/positions and a currently selected position are identity no-ops. */
export function changeValvePosition(
  definition: PuzzleDefinition,
  state: PuzzleState,
  valve: string,
  position: string,
): PuzzleState {
  assertValidDefinition(definition)
  if (!Object.hasOwn(definition.schematic.valves, valve)) return state
  const valveId = valve as ValveId
  if (
    !Object.hasOwn(definition.schematic.valves[valveId], position) ||
    state.positions[valveId] === position
  )
    return state
  const positions = {
    ...state.positions,
    [valveId]: position,
  } as ValvePositions
  return {
    ...state,
    positions,
    adjustments: state.adjustments + 1,
    observations: [
      ...state.observations,
      recordObservation(definition, positions, state.observations.length + 1, {
        type: 'VALVE CHANGE',
        valve: valveId,
        position,
      }),
    ],
  }
}

function copyScope(group: CandidateGroup): CandidateGroup {
  return {
    fittings: [...group.fittings],
    first: [...group.first],
    second: [...group.second],
  }
}

/** This API intentionally has no fixture parameter. It cannot rank concealed fittings. */
export function previewTrace(
  schematic: PublicSchematic,
  knowledge: TraceKnowledge,
  target: string,
): TracePreview {
  const group = schematic.candidateGroups.find((candidate) =>
    candidate.fittings.some((id) => id === target),
  )
  if (!group) return { target: null, status: 'invalid', cost: 0, scope: null }
  const id = target as FittingId
  const known = knowledge.discoveries.some((discovery) => discovery.id === id)
  return {
    target: id,
    status: known
      ? 'known'
      : knowledge.chargesRemaining > 0
        ? 'available'
        : 'exhausted',
    cost: known || knowledge.chargesRemaining <= 0 ? 0 : 1,
    scope: copyScope(group),
  }
}

export function applyTrace(
  definition: PuzzleDefinition,
  state: PuzzleState,
  target: string,
): PuzzleState {
  assertValidDefinition(definition)
  const preview = previewTrace(
    definition.schematic,
    {
      discoveries: state.discoveries,
      chargesRemaining: state.traceBudget - state.tracesSpent,
    },
    target,
  )
  if (preview.status !== 'available') return state
  const fitting = definition.fittings.find(
    (item) => item.id === preview.target,
  )!
  return {
    ...state,
    tracesSpent: state.tracesSpent + 1,
    discoveries: [
      ...state.discoveries,
      { id: fitting.id, from: fitting.from, to: fitting.to },
    ],
  }
}

/** Resets routing, retaining every observation, discovery, expenditure and adjustment. */
export function resetRouting(
  definition: PuzzleDefinition,
  state: PuzzleState,
): PuzzleState {
  assertValidDefinition(definition)
  const positions = copyPositions(definition.initialPositions)
  return {
    ...state,
    positions,
    observations: [
      ...state.observations,
      recordObservation(definition, positions, state.observations.length + 1, {
        type: 'ROUTING RESET',
      }),
    ],
  }
}

function copyReadings(readings: BehavioralReadings): BehavioralReadings {
  return {
    S: readings.S,
    X: readings.X,
    Y: readings.Y,
    return: readings.return,
    reactor: readings.reactor,
  }
}

function copyDiscovery(discovery: StructuralDiscovery): StructuralDiscovery {
  return { id: discovery.id, from: discovery.from, to: discovery.to }
}

function copyAction(action: ObservationAction): ObservationAction {
  return action.type === 'VALVE CHANGE'
    ? { type: action.type, valve: action.valve, position: action.position }
    : { type: action.type }
}

function copySchematic(schematic: PublicSchematic): PublicSchematic {
  const copyEdges = (edges: readonly DirectedEdge[]) =>
    edges.map(({ from, to }) => ({ from, to }))
  return {
    ports: [...schematic.ports],
    oneWay: schematic.oneWay,
    candidateGroups: schematic.candidateGroups.map(copyScope),
    valves: {
      V1: {
        A: copyEdges(schematic.valves.V1.A),
        B: copyEdges(schematic.valves.V1.B),
      },
      V2: {
        I: copyEdges(schematic.valves.V2.I),
        II: copyEdges(schematic.valves.V2.II),
        III: copyEdges(schematic.valves.V2.III),
      },
      V3: {
        u: copyEdges(schematic.valves.V3.u),
        v: copyEdges(schematic.valves.V3.v),
      },
    },
  }
}

/** Allowlisted projection: no fixture/state spreads, solver graph or reachability. */
export function selectPlayerSafeView(
  definition: PuzzleDefinition,
  state: PuzzleState,
): PlayerSafeView {
  return {
    schematic: copySchematic(definition.schematic),
    positions: copyPositions(state.positions),
    readings: copyReadings(observeBehavior(definition, state.positions)),
    observations: state.observations.map((observation) => ({
      experiment: observation.experiment,
      action: copyAction(observation.action),
      positions: copyPositions(observation.positions),
      readings: copyReadings(observation.readings),
    })),
    discoveries: state.discoveries.map(copyDiscovery),
    traceBudget: state.traceBudget,
    tracesSpent: state.tracesSpent,
    chargesRemaining: state.traceBudget - state.tracesSpent,
    adjustments: state.adjustments,
  }
}
