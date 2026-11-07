import type { Intent } from './commands'

// Disposable, non-canonical equipment exercise. No mission/domain imports.
export const demoSteps: readonly {
  intent: Intent
  prompt: string
  response: string
}[] = [
  {
    intent: 'SCAN_COOLING',
    prompt:
      'Primary cooling offline. Auxiliary circulation available. Say scan cooling.',
    response:
      'Cooling scan complete. Auxiliary pump ready. Say start auxiliary pump.',
  },
  {
    intent: 'START_AUX_PUMP',
    prompt: 'Say start auxiliary pump.',
    response: 'Auxiliary pump online. Say status.',
  },
  {
    intent: 'STATUS',
    prompt: 'Say status.',
    response: 'Circulation stable. Check the power supply. Say scan power.',
  },
  {
    intent: 'SCAN_POWER',
    prompt: 'Say scan power.',
    response: 'Power reserve available. Say route power to cooling.',
  },
  {
    intent: 'ROUTE_POWER_COOLING',
    prompt: 'Say route power to cooling.',
    response: 'Cooling supply stable. Exercise complete.',
  },
]
export interface DemoState {
  step: number
  message: string
}
export function startDemo(): DemoState {
  return { step: 0, message: demoSteps[0]!.prompt }
}
export function advanceDemo(state: DemoState, intent: Intent): DemoState {
  if (intent === 'REPEAT' || state.step >= demoSteps.length) return state
  const step = demoSteps[state.step]!
  if (intent !== step.intent)
    return { ...state, message: `Command unavailable here. ${step.prompt}` }
  return { step: state.step + 1, message: step.response }
}
