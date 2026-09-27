import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  commitMissionFlowUpdate,
  isContinuousMissionPhaseChange,
} from './missionFlowTransition'

const originalStartViewTransition = Object.getOwnPropertyDescriptor(
  document,
  'startViewTransition',
)
const originalMatchMedia = window.matchMedia

afterEach(() => {
  if (originalStartViewTransition === undefined) {
    Reflect.deleteProperty(document, 'startViewTransition')
  } else {
    Object.defineProperty(
      document,
      'startViewTransition',
      originalStartViewTransition,
    )
  }
  window.matchMedia = originalMatchMedia
})

describe('mission flow transitions', () => {
  it('limits continuity effects to adjacent primary mission phases', () => {
    expect(isContinuousMissionPhaseChange('preMission', 'warming')).toBe(true)
    expect(isContinuousMissionPhaseChange('warming', 'countdown')).toBe(true)
    expect(isContinuousMissionPhaseChange('countdown', 'activeMission')).toBe(
      true,
    )
    expect(isContinuousMissionPhaseChange('activeMission', 'result')).toBe(true)
    expect(isContinuousMissionPhaseChange('activeMission', 'suspended')).toBe(
      false,
    )
    expect(isContinuousMissionPhaseChange('result', 'preMission')).toBe(false)
  })

  it('uses the browser transition for a continuous phase change', () => {
    const update = vi.fn()
    const updateCallbackDone = Promise.resolve()
    const startViewTransition = vi.fn((callback: () => void) => {
      callback()
      return { updateCallbackDone }
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })

    expect(commitMissionFlowUpdate('warming', 'countdown', update)).toBe(
      updateCallbackDone,
    )

    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledOnce()
  })

  it('updates immediately when reduced motion is requested', () => {
    const update = vi.fn()
    const startViewTransition = vi.fn((callback: () => void) => {
      callback()
      return { updateCallbackDone: Promise.resolve() }
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })

    commitMissionFlowUpdate('countdown', 'activeMission', update)

    expect(startViewTransition).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledOnce()
  })
})
