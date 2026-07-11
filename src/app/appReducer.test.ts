import { describe, expect, it } from 'vitest'

import type { AppEvent, AppState } from './AppState'
import { appReducer, appTransitionTable } from './appReducer'

interface Warmup {
  readonly progress: number
}

interface Mission {
  readonly stability: number
}

interface Result {
  readonly outcome: 'success' | 'failure'
}

type State = AppState<Warmup, Mission, Result>
type Event = AppEvent<Warmup, Mission, Result>

const runId = 'run-1'
const warmup = { progress: 0 }
const qualifiedWarmup = { progress: 100 }
const mission = { stability: 100 }

function reduce(state: State, ...events: readonly Event[]): State {
  return events.reduce(appReducer, state)
}

function warming(): State {
  return reduce(
    { phase: 'preMission' },
    { type: 'warmupStarted', runId, warmup },
  )
}

function countdown(): State {
  return reduce(warming(), {
    type: 'countdownStarted',
    runId,
    warmup: qualifiedWarmup,
  })
}

function active(): State {
  return reduce(countdown(), { type: 'missionStarted', runId, mission })
}

function suspend(
  state: State,
  reason: 'manual' | 'disconnect' = 'manual',
): State {
  return reduce(state, { type: 'suspended', runId, reason })
}

describe('appReducer', () => {
  it('documents every lifecycle state in the transition table', () => {
    expect(Object.keys(appTransitionTable)).toEqual([
      'preMission',
      'warming',
      'countdown',
      'activeMission',
      'suspended',
      'result',
    ])
    expect(appTransitionTable.suspended).toEqual({
      warming: [
        'warmupUpdated',
        'suspended',
        'suspensionCleared (reason present)',
        'warmupRecovered (only manual latch remains)',
        'runAbandoned',
      ],
      countdown: [
        'warmupUpdated',
        'suspended',
        'suspensionCleared (reason present)',
        'warmupRecovered (only manual latch remains)',
        'runAbandoned',
      ],
      activeMission: [
        'missionUpdated',
        'suspended',
        'suspensionCleared (reason present)',
        'resumed (only manual latch remains)',
        'runEnded',
        'runAbandoned',
      ],
    })
  })

  it('owns exactly one canonical warm-up or mission value per live run', () => {
    const liveStates = [
      warming(),
      countdown(),
      active(),
      suspend(warming()),
      suspend(countdown()),
      suspend(active()),
    ]

    for (const state of liveStates) {
      if (state.phase === 'preMission' || state.phase === 'result') {
        throw new Error('Expected a live run state')
      }
      const canonicalOwner =
        state.phase === 'suspended' ? state.resumeTarget : state
      expect('warmup' in canonicalOwner || 'mission' in canonicalOwner).toBe(
        true,
      )
      expect('warmup' in canonicalOwner && 'mission' in canonicalOwner).toBe(
        false,
      )
      expect(canonicalOwner.runId).toBe(runId)
    }
  })

  it('implements every allowed non-suspended transition', () => {
    const success: Result = { outcome: 'success' }
    const cases: readonly {
      state: State
      event: Event
      expectedPhase: State['phase']
    }[] = [
      {
        state: { phase: 'preMission' },
        event: { type: 'warmupStarted', runId, warmup },
        expectedPhase: 'warming',
      },
      {
        state: warming(),
        event: { type: 'warmupUpdated', runId, warmup: qualifiedWarmup },
        expectedPhase: 'warming',
      },
      {
        state: warming(),
        event: { type: 'countdownStarted', runId, warmup: qualifiedWarmup },
        expectedPhase: 'countdown',
      },
      {
        state: warming(),
        event: { type: 'suspended', runId, reason: 'manual' },
        expectedPhase: 'suspended',
      },
      {
        state: warming(),
        event: { type: 'runAbandoned', runId },
        expectedPhase: 'preMission',
      },
      {
        state: countdown(),
        event: { type: 'warmupUpdated', runId, warmup },
        expectedPhase: 'warming',
      },
      {
        state: countdown(),
        event: { type: 'missionStarted', runId, mission },
        expectedPhase: 'activeMission',
      },
      {
        state: countdown(),
        event: { type: 'suspended', runId, reason: 'hidden' },
        expectedPhase: 'suspended',
      },
      {
        state: countdown(),
        event: { type: 'runAbandoned', runId },
        expectedPhase: 'preMission',
      },
      {
        state: active(),
        event: {
          type: 'missionUpdated',
          runId,
          mission: { stability: 90 },
        },
        expectedPhase: 'activeMission',
      },
      {
        state: active(),
        event: { type: 'suspended', runId, reason: 'disconnect' },
        expectedPhase: 'suspended',
      },
      {
        state: active(),
        event: { type: 'runEnded', runId, result: success },
        expectedPhase: 'result',
      },
      {
        state: active(),
        event: { type: 'runAbandoned', runId },
        expectedPhase: 'preMission',
      },
      {
        state: { phase: 'result', runId, result: success },
        event: { type: 'runAgain' },
        expectedPhase: 'preMission',
      },
    ]

    for (const testCase of cases) {
      expect(reduce(testCase.state, testCase.event).phase).toBe(
        testCase.expectedPhase,
      )
    }
  })

  it('moves through warm-up, countdown, mission, and either result outcome', () => {
    expect(warming()).toEqual({ phase: 'warming', runId, warmup })
    expect(countdown()).toEqual({
      phase: 'countdown',
      runId,
      warmup: qualifiedWarmup,
    })
    expect(active()).toEqual({
      phase: 'activeMission',
      runId,
      mission,
    })

    for (const outcome of ['success', 'failure'] as const) {
      const result = reduce(active(), {
        type: 'runEnded',
        runId,
        result: { outcome },
      })
      expect(result).toEqual({
        phase: 'result',
        runId,
        result: { outcome },
      })
      expect(reduce(result, { type: 'runAgain' })).toEqual({
        phase: 'preMission',
      })
    }
  })

  it('stores exactly one canonical domain value and replaces it only with controller output', () => {
    const nextWarmup = { progress: 35 }
    const nextMission = { stability: 82 }

    expect(
      reduce(warming(), { type: 'warmupUpdated', runId, warmup: nextWarmup }),
    ).toMatchObject({ warmup: nextWarmup })
    expect(
      reduce(active(), { type: 'missionUpdated', runId, mission: nextMission }),
    ).toMatchObject({ mission: nextMission })
  })

  it('retains canonical mission state while paused and requires explicit resume', () => {
    const paused = reduce(active(), {
      type: 'suspended',
      runId,
      reason: 'manual',
    })
    expect(paused).toEqual({
      phase: 'suspended',
      resumeTarget: { phase: 'activeMission', runId, mission },
      reasons: ['manual'],
    })

    const updated = reduce(paused, {
      type: 'missionUpdated',
      runId,
      mission: { stability: 90 },
    })
    expect(reduce(updated, { type: 'resumed', runId })).toEqual({
      phase: 'activeMission',
      runId,
      mission: { stability: 90 },
    })
  })

  it('keeps suspension reasons nonempty and duplicate-free', () => {
    const interrupted = reduce(
      active(),
      { type: 'suspended', runId, reason: 'hidden' },
      { type: 'suspended', runId, reason: 'disconnect' },
      { type: 'suspended', runId, reason: 'disconnect' },
    )
    expect(interrupted).toMatchObject({
      phase: 'suspended',
      reasons: ['hidden', 'disconnect'],
    })

    const cleared = reduce(interrupted, {
      type: 'suspensionCleared',
      runId,
      reason: 'disconnect',
    })
    expect(cleared).toMatchObject({ reasons: ['hidden'] })
    const ready = reduce(cleared, {
      type: 'suspensionCleared',
      runId,
      reason: 'hidden',
    })
    expect(ready).toMatchObject({ reasons: ['manual'] })
  })

  it('never resumes automatically when blockers are cleared', () => {
    const interrupted = reduce(
      active(),
      { type: 'suspended', runId, reason: 'hidden' },
      { type: 'suspended', runId, reason: 'disconnect' },
    )

    const stillHidden = reduce(interrupted, {
      type: 'suspensionCleared',
      runId,
      reason: 'disconnect',
    })
    expect(stillHidden).toMatchObject({
      phase: 'suspended',
      reasons: ['hidden'],
    })
    expect(reduce(stillHidden, { type: 'resumed', runId })).toBe(stillHidden)

    const ready = reduce(stillHidden, {
      type: 'suspensionCleared',
      runId,
      reason: 'hidden',
    })
    expect(ready).toMatchObject({ phase: 'suspended', reasons: ['manual'] })
    expect(reduce(ready, { type: 'resumed', runId })).toEqual(active())
  })

  it.each(['warming', 'countdown'] as const)(
    '%s recovery rejects direct resume and requires a fresh warm-up value',
    (phase) => {
      const starting = phase === 'warming' ? warming() : countdown()
      const disconnected = reduce(starting, {
        type: 'suspended',
        runId,
        reason: 'disconnect',
      })
      const blockedRecovery = reduce(disconnected, {
        type: 'warmupRecovered',
        runId,
        warmup,
      })
      expect(blockedRecovery).toBe(disconnected)

      const ready = reduce(disconnected, {
        type: 'suspensionCleared',
        runId,
        reason: 'disconnect',
      })
      expect(reduce(ready, { type: 'resumed', runId })).toBe(ready)
      expect(reduce(ready, { type: 'warmupRecovered', runId, warmup })).toEqual(
        { phase: 'warming', runId, warmup },
      )
    },
  )

  it('guards suspended transitions by resume-target phase and blocker state', () => {
    const suspendedWarming = suspend(warming())
    const suspendedCountdown = suspend(countdown())
    const suspendedMission = suspend(active())
    const nextWarmup = { progress: 25 }
    const nextMission = { stability: 75 }
    const success: Result = { outcome: 'success' }

    expect(
      reduce(suspendedWarming, {
        type: 'warmupUpdated',
        runId,
        warmup: nextWarmup,
      }),
    ).toMatchObject({ resumeTarget: { phase: 'warming', warmup: nextWarmup } })
    expect(
      reduce(suspendedCountdown, {
        type: 'warmupUpdated',
        runId,
        warmup: nextWarmup,
      }),
    ).toMatchObject({
      resumeTarget: { phase: 'countdown', warmup: nextWarmup },
    })
    expect(
      reduce(suspendedMission, {
        type: 'missionUpdated',
        runId,
        mission: nextMission,
      }),
    ).toMatchObject({
      resumeTarget: { phase: 'activeMission', mission: nextMission },
    })

    expect(
      reduce(suspendedWarming, {
        type: 'missionUpdated',
        runId,
        mission: nextMission,
      }),
    ).toBe(suspendedWarming)
    expect(
      reduce(suspendedMission, {
        type: 'warmupUpdated',
        runId,
        warmup: nextWarmup,
      }),
    ).toBe(suspendedMission)
    expect(
      reduce(suspendedWarming, { type: 'runEnded', runId, result: success }),
    ).toBe(suspendedWarming)
    expect(
      reduce(suspendedMission, { type: 'runEnded', runId, result: success }),
    ).toEqual({ phase: 'result', runId, result: success })

    const absentBlockerClear = reduce(suspendedMission, {
      type: 'suspensionCleared',
      runId,
      reason: 'hidden',
    })
    expect(absentBlockerClear).toBe(suspendedMission)
    expect(
      reduce(suspendedMission, {
        type: 'suspended',
        runId,
        reason: 'hidden',
      }),
    ).toMatchObject({ reasons: ['manual', 'hidden'] })

    for (const state of [
      suspendedWarming,
      suspendedCountdown,
      suspendedMission,
    ]) {
      expect(reduce(state, { type: 'runAbandoned', runId })).toEqual({
        phase: 'preMission',
      })
    }
  })

  it('does not use warm-up recovery to replace a suspended mission', () => {
    const disconnected = reduce(active(), {
      type: 'suspended',
      runId,
      reason: 'disconnect',
    })
    const ready = reduce(disconnected, {
      type: 'suspensionCleared',
      runId,
      reason: 'disconnect',
    })
    expect(reduce(ready, { type: 'warmupRecovered', runId, warmup })).toBe(
      ready,
    )
  })

  it('allows abandonment from every live run state without creating a result', () => {
    const states = [
      warming(),
      countdown(),
      active(),
      reduce(active(), { type: 'suspended', runId, reason: 'manual' }),
    ]
    for (const state of states) {
      expect(reduce(state, { type: 'runAbandoned', runId })).toEqual({
        phase: 'preMission',
      })
    }
  })

  it('rejects illegal and stale-run events by identity', () => {
    const current = active()
    expect(
      reduce(current, {
        type: 'missionUpdated',
        runId: 'stale-run',
        mission: { stability: 0 },
      }),
    ).toBe(current)
    expect(reduce(current, { type: 'countdownStarted', runId, warmup })).toBe(
      current,
    )
  })

  it('rejects every run-scoped event after finalization', () => {
    const finalized = reduce(active(), {
      type: 'runEnded',
      runId,
      result: { outcome: 'success' },
    })
    const runScopedEvents: readonly Event[] = [
      { type: 'warmupStarted', runId: 'run-2', warmup },
      { type: 'warmupUpdated', runId, warmup },
      { type: 'countdownStarted', runId, warmup: qualifiedWarmup },
      { type: 'missionStarted', runId, mission },
      {
        type: 'missionUpdated',
        runId,
        mission: { stability: 0 },
      },
      { type: 'suspended', runId, reason: 'hidden' },
      { type: 'suspensionCleared', runId, reason: 'hidden' },
      { type: 'resumed', runId },
      { type: 'warmupRecovered', runId, warmup },
      { type: 'runEnded', runId, result: { outcome: 'failure' } },
      { type: 'runAbandoned', runId },
    ]

    for (const event of runScopedEvents) {
      expect(reduce(finalized, event)).toBe(finalized)
    }
  })
})
