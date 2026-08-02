import { describe, expect, it } from 'vitest'

import { defaultGameplayTuning } from '../config/gameplayTuning'
import { createClassifierState } from '../domain/heart-rate/classifier'
import type {
  MissionOutcome,
  MissionPlayState,
} from '../domain/mission/activeMission'
import {
  announcementForActiveRunTransition,
  announcementForInterruption,
  announcementForTelemetryStatus,
} from './FlowAnnouncements'
import { createMissionRun } from './MissionRun'
import type { MissionRun } from './MissionRun'

const tuning = {
  stabilityMinimum: defaultGameplayTuning.stability.minimum,
  stabilityMaximum: defaultGameplayTuning.stability.maximum,
}

function runWith({
  classification = 'operational',
  stability = 100,
  playState = 'active',
  outcome = null,
}: {
  readonly classification?: 'below' | 'operational' | 'above' | null
  readonly stability?: number
  readonly playState?: MissionPlayState
  readonly outcome?: MissionOutcome | null
} = {}): MissionRun {
  const classifier = {
    ...createClassifierState(0),
    signalQuality: 'usable' as const,
    stableClassification: classification,
  }
  const run = createMissionRun(
    0,
    { lowerBpm: 100, upperBpm: 140 },
    classifier,
    defaultGameplayTuning,
  )
  return {
    ...run,
    session: {
      ...run.session,
      mission: {
        ...run.session.mission,
        stability,
        playState,
        signalQuality: 'usable',
        stableClassification: classification,
        ...(outcome === null
          ? {}
          : {
              status: {
                phase: 'finalized' as const,
                outcome,
                finalizedAtTimeMs: 0,
                finalizedBySequence: 1,
              },
            }),
      },
    },
  }
}

function announce(
  before: MissionRun,
  after: MissionRun,
  fallback = 'Existing announcement',
  selectedTuning = tuning,
): string {
  return announcementForActiveRunTransition(
    before,
    after,
    fallback,
    selectedTuning,
  )
}

describe('flow announcements', () => {
  it('selects one deterministic interruption announcement by priority', () => {
    expect(
      announcementForInterruption(
        ['resumeAvailable', 'signalStale', 'disconnected'],
        'Existing announcement',
      ),
    ).toBe('Heart-rate monitor disconnected. Mission paused.')
    expect(announcementForInterruption([], 'Existing announcement')).toBe(
      'Existing announcement',
    )
  })

  it('returns the fallback for an ordinary unchanged transition', () => {
    const before = runWith({ classification: 'above', stability: 74 })
    const after = runWith({ classification: 'above', stability: 73 })

    expect(announce(before, after)).toBe('Existing announcement')
  })

  it('announces decreasing once and does not repeat within the same trend', () => {
    const holding = runWith({ classification: 'operational', stability: 100 })
    const decreasing = runWith({ classification: 'above', stability: 99 })
    const stillDecreasing = runWith({
      classification: 'above',
      stability: 98,
    })

    expect(announce(holding, decreasing)).toBe(
      'Heart rate is above range. Station stability is decreasing',
    )
    expect(announce(decreasing, stillDecreasing)).toBe('Existing announcement')
  })

  it('announces recovering and holding only when each trend begins', () => {
    const decreasing = runWith({ classification: 'above', stability: 70 })
    const recovering = runWith({
      classification: 'operational',
      stability: 70,
    })
    const stillRecovering = runWith({
      classification: 'operational',
      stability: 80,
    })
    const holding = runWith({
      classification: 'operational',
      stability: 100,
    })

    expect(announce(decreasing, recovering)).toBe(
      'Heart rate is operational. Station stability is recovering',
    )
    expect(announce(recovering, stillRecovering)).toBe('Existing announcement')
    expect(announce(stillRecovering, holding)).toBe(
      'Station stability is holding',
    )
  })

  it('announces warning and critical crossings without repeating a band', () => {
    expect(
      announce(
        runWith({ classification: 'above', stability: 76 }),
        runWith({ classification: 'above', stability: 75 }),
      ),
    ).toBe('Station stability warning: 75 percent')
    expect(
      announce(
        runWith({ classification: 'above', stability: 51 }),
        runWith({ classification: 'above', stability: 50 }),
      ),
    ).toBe('Station stability critical: 50 percent')
    expect(
      announce(
        runWith({ classification: 'above', stability: 50 }),
        runWith({ classification: 'above', stability: 49 }),
      ),
    ).toBe('Existing announcement')
  })

  it('orders every threshold crossed by one large transition', () => {
    const large = announce(
      runWith({ classification: 'above', stability: 100 }),
      runWith({ classification: 'above', stability: 20 }),
    )
    const small = [
      announce(
        runWith({ classification: 'above', stability: 100 }),
        runWith({ classification: 'above', stability: 75 }),
      ),
      announce(
        runWith({ classification: 'above', stability: 75 }),
        runWith({ classification: 'above', stability: 50 }),
      ),
      announce(
        runWith({ classification: 'above', stability: 50 }),
        runWith({ classification: 'above', stability: 25 }),
      ),
    ]

    expect(large).toBe(
      'Station stability warning: 75 percent. Station stability critical: 50 percent. Station stability critical: 25 percent',
    )
    expect(large.split('. ')).toEqual(small)
  })

  it('derives percentage thresholds from a non-zero configured range', () => {
    const selectedTuning = {
      stabilityMinimum: 20,
      stabilityMaximum: 220,
    }
    const tuningSnapshot = structuredClone(selectedTuning)

    expect(
      announce(
        runWith({ classification: 'above', stability: 171 }),
        runWith({ classification: 'above', stability: 170 }),
        'Existing announcement',
        selectedTuning,
      ),
    ).toBe('Station stability warning: 75 percent')
    expect(
      announce(
        runWith({ classification: 'above', stability: 121 }),
        runWith({ classification: 'above', stability: 120 }),
        'Existing announcement',
        selectedTuning,
      ),
    ).toBe('Station stability critical: 50 percent')
    expect(
      announce(
        runWith({ classification: 'above', stability: 71 }),
        runWith({ classification: 'above', stability: 70 }),
        'Existing announcement',
        selectedTuning,
      ),
    ).toBe('Station stability critical: 25 percent')
    expect(
      announce(
        runWith({ classification: 'above', stability: 170 }),
        runWith({ classification: 'above', stability: 169 }),
        'Existing announcement',
        selectedTuning,
      ),
    ).toBe('Existing announcement')
    expect(
      announce(
        runWith({ classification: 'above', stability: 220 }),
        runWith({ classification: 'above', stability: 69 }),
        'Existing announcement',
        selectedTuning,
      ),
    ).toBe(
      'Station stability warning: 75 percent. Station stability critical: 50 percent. Station stability critical: 25 percent',
    )
    expect(selectedTuning).toEqual(tuningSnapshot)
  })

  it('keeps pauses silent and announces each finalized outcome once', () => {
    const active = runWith({ classification: 'above', stability: 70 })
    const paused = runWith({
      classification: 'above',
      stability: 70,
      playState: 'suspended',
    })

    expect(announce(active, paused)).toBe('Existing announcement')
    expect(
      announce(
        runWith({ stability: 100 }),
        runWith({ stability: 100, outcome: 'success' }),
      ),
    ).toBe('Mission complete')
    expect(
      announce(
        runWith({ classification: 'above', stability: 0 }),
        runWith({
          classification: 'above',
          stability: 0,
          outcome: 'failure',
        }),
      ),
    ).toBe('Reactor failure')
  })

  it('uses the existing telemetry status wording', () => {
    expect(announcementForTelemetryStatus({ state: 'connected' })).toBe(
      'Heart-rate monitor connected',
    )
    expect(announcementForTelemetryStatus({ state: 'connecting' })).toBe(
      'Connecting to heart-rate monitor',
    )
    expect(announcementForTelemetryStatus({ state: 'disconnected' })).toBe(
      'Heart-rate monitor disconnected',
    )
    expect(
      announcementForTelemetryStatus({
        state: 'error',
        error: { code: 'source-error', message: 'Safe source error' },
      }),
    ).toBe('Safe source error')
  })

  it('is deterministic and does not mutate its inputs', () => {
    const before = runWith({ classification: 'above', stability: 76 })
    const after = runWith({ classification: 'above', stability: 74 })
    const beforeSnapshot = structuredClone(before)
    const afterSnapshot = structuredClone(after)
    const tuningSnapshot = structuredClone(tuning)

    const first = announce(before, after)
    const second = announce(before, after)

    expect(first).toBe(second)
    expect(before).toEqual(beforeSnapshot)
    expect(after).toEqual(afterSnapshot)
    expect(tuning).toEqual(tuningSnapshot)
  })

  it('has no React, browser, clock, or timer dependency', async () => {
    const source = await import('./FlowAnnouncements?raw')
    expect(source.default).not.toMatch(
      /(?:from ['"]react|window\.|document\.|navigator\.|Date\.now|performance\.now|setTimeout|setInterval)/,
    )
  })
})
