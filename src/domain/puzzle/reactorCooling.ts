import {
  COOLANT_SCHEMATIC,
  DEFAULT_TRACE_BUDGET,
  deepFreeze,
} from './definition'
import type { PuzzleDefinition } from './types'

export const reactorCooling: PuzzleDefinition = deepFreeze({
  schematic: COOLANT_SCHEMATIC,
  fittings: [
    { id: 'A', from: 'V1.A', to: 'V2.q' },
    { id: 'B', from: 'V1.B', to: 'V2.p' },
    { id: 'C', from: 'V3.u', to: 'V2.x' },
    { id: 'D', from: 'V2.y', to: 'V3.v' },
  ],
  initialPositions: { V1: 'A', V2: 'I', V3: 'u' },
  traceBudget: DEFAULT_TRACE_BUDGET,
})
