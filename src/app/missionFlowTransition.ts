import { flushSync } from 'react-dom'

import type { MissionFlowLifecycle } from './MissionFlowController'

type MissionPhase = MissionFlowLifecycle['phase']

const continuousPhaseChanges = new Set<string>([
  'preMission:warming',
  'warming:countdown',
  'countdown:warming',
  'countdown:activeMission',
  'activeMission:result',
])

export function isContinuousMissionPhaseChange(
  from: MissionPhase,
  to: MissionPhase,
): boolean {
  return continuousPhaseChanges.has(`${from}:${to}`)
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function commitMissionFlowUpdate(
  from: MissionPhase,
  to: MissionPhase,
  update: () => void,
): Promise<void> | null {
  const transitionDocument = typeof document === 'undefined' ? null : document
  const startViewTransition =
    transitionDocument !== null &&
    typeof transitionDocument.startViewTransition === 'function'
      ? transitionDocument.startViewTransition
      : undefined

  if (
    !isContinuousMissionPhaseChange(from, to) ||
    startViewTransition === undefined ||
    prefersReducedMotion()
  ) {
    update()
    return null
  }

  const transition = startViewTransition.call(transitionDocument, () => {
    flushSync(update)
  })
  return transition.updateCallbackDone
}
