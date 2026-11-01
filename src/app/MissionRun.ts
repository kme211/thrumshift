import type {
  ClassifierState,
  TargetRange,
} from '../domain/heart-rate/classifier'
import { reactorCooling } from '../domain/puzzle/reactorCooling'
import { createPuzzleState } from '../domain/puzzle/model'
import type { PuzzleState } from '../domain/puzzle/types'
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
}

export function createMissionRun(
  occurredAt: number,
  targetRange: TargetRange,
  classifier: ClassifierState,
  tuning: GameplayTuning,
): MissionRun {
  return {
    classifier,
    puzzle: createPuzzleState(reactorCooling),
    session: createMissionSessionState(occurredAt, targetRange, tuning),
  }
}
