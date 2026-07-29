import type {
  ClassifierState,
  TargetRange,
} from '../domain/heart-rate/classifier'
import { reactorCoolingEasy } from '../domain/puzzle/boards/reactorCoolingEasy'
import { createPuzzleState } from '../domain/puzzle/model'
import type { PuzzleHint, PuzzleState } from '../domain/puzzle/types'
import { createMissionSessionState } from '../domain/mission/missionSession'
import type { MissionSessionState } from '../domain/mission/missionSession'
import type { GameplayTuning } from '../config/gameplayTuning'

/**
 * The one canonical aggregate owned by a live run. React receives this value
 * from the lifecycle reducer and never mirrors any of its domain members.
 */
export interface MissionRun {
  readonly classifier: ClassifierState
  readonly puzzle: PuzzleState
  readonly session: MissionSessionState
  readonly hint: PuzzleHint | null
  readonly puzzleRotationCounts: Readonly<Record<string, number>>
  readonly hintEligibilityMs: number
}

export function createMissionRun(
  occurredAt: number,
  targetRange: TargetRange,
  classifier: ClassifierState,
  tuning: GameplayTuning,
): MissionRun {
  return {
    classifier,
    puzzle: createPuzzleState(reactorCoolingEasy),
    session: createMissionSessionState(occurredAt, targetRange, tuning),
    hint: null,
    puzzleRotationCounts: {},
    hintEligibilityMs: tuning.puzzle.hintEligibilityMs,
  }
}

export function getMissionHintEligibility(run: MissionRun): {
  readonly eligible: boolean
  readonly remainingMs: number
} {
  const remainingMs = Math.max(
    0,
    run.hintEligibilityMs - run.session.mission.activeElapsedTimeMs,
  )
  return { eligible: remainingMs === 0, remainingMs }
}
