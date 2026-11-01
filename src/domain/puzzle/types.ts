export const FITTING_IDS = ['A', 'B', 'C', 'D'] as const
export type FittingId = (typeof FITTING_IDS)[number]
export const PORT_IDS = [
  'S',
  'V1.A',
  'V1.B',
  'V2.p',
  'V2.q',
  'V2.x',
  'V2.y',
  'V3.u',
  'V3.v',
  'return',
  'reactor',
] as const
export type PortId = (typeof PORT_IDS)[number]
export interface ValvePositions {
  readonly V1: 'A' | 'B'
  readonly V2: 'I' | 'II' | 'III'
  readonly V3: 'u' | 'v'
}
export type ValveId = keyof ValvePositions
export interface DirectedEdge {
  readonly from: PortId
  readonly to: PortId
}
export interface ConcealedFitting extends DirectedEdge {
  readonly id: FittingId
}
export interface CandidateGroup {
  readonly fittings: readonly FittingId[]
  readonly first: readonly PortId[]
  readonly second: readonly PortId[]
}
export interface PublicSchematic {
  readonly ports: readonly PortId[]
  readonly valves: {
    readonly [V in ValveId]: Readonly<
      Record<ValvePositions[V], readonly DirectedEdge[]>
    >
  }
  readonly candidateGroups: readonly CandidateGroup[]
  readonly oneWay: true
}
export interface PuzzleDefinition {
  readonly schematic: PublicSchematic
  readonly fittings: readonly ConcealedFitting[]
  readonly initialPositions: ValvePositions
  readonly traceBudget: number
}
export interface BehavioralReadings {
  readonly S: boolean
  readonly X: boolean
  readonly Y: boolean
  readonly return: boolean
  readonly reactor: boolean
}
export type ObservationAction =
  | { readonly type: 'INITIAL' }
  | {
      readonly type: 'VALVE CHANGE'
      readonly valve: ValveId
      readonly position: string
    }
  | { readonly type: 'ROUTING RESET' }
export interface BehavioralObservation {
  readonly experiment: number
  readonly action: ObservationAction
  readonly positions: ValvePositions
  readonly readings: BehavioralReadings
}
/** A revealed fitting's from/to pair also specifies its permitted direction. */
export interface StructuralDiscovery extends DirectedEdge {
  readonly id: FittingId
}
export interface PuzzleState {
  readonly positions: ValvePositions
  readonly observations: readonly BehavioralObservation[]
  readonly discoveries: readonly StructuralDiscovery[]
  readonly traceBudget: number
  readonly tracesSpent: number
  readonly adjustments: number
}
export interface TraceKnowledge {
  readonly discoveries: readonly StructuralDiscovery[]
  readonly chargesRemaining: number
}
export interface TracePreview {
  readonly target: FittingId | null
  readonly status: 'invalid' | 'known' | 'available' | 'exhausted'
  readonly cost: 0 | 1
  readonly scope: CandidateGroup | null
}
export interface PlayerSafeView {
  readonly schematic: PublicSchematic
  readonly positions: ValvePositions
  readonly readings: BehavioralReadings
  readonly observations: readonly BehavioralObservation[]
  readonly discoveries: readonly StructuralDiscovery[]
  readonly traceBudget: number
  readonly tracesSpent: number
  readonly chargesRemaining: number
  readonly adjustments: number
}
export interface DefinitionValidation {
  readonly valid: boolean
  readonly errors: readonly string[]
}
