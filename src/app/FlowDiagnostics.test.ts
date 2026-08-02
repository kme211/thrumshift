import { describe, expect, it } from 'vitest'

import {
  createMissionFlowState,
  missionFlowReducer,
} from './MissionFlowController'
import type { MissionFlowFact, MissionFlowState } from './MissionFlowController'
import { appendFlowDiagnostics } from './FlowDiagnostics'
import type { FlowDiagnosticEntry } from './FlowDiagnostics'

function connectedFact(occurredAt: number, sequence: number): MissionFlowFact {
  return {
    type: 'status',
    occurredAt,
    sequence,
    status: { state: 'connected' },
  }
}

describe('flow diagnostics', () => {
  it('logs only canonical visibility changes and leaves duplicate facts gameplay-neutral', () => {
    const facts: readonly MissionFlowFact[] = [
      { type: 'visibility', occurredAt: 100, sequence: 1, state: 'hidden' },
      { type: 'visibility', occurredAt: 110, sequence: 2, state: 'hidden' },
      { type: 'visibility', occurredAt: 120, sequence: 3, state: 'visible' },
      { type: 'visibility', occurredAt: 130, sequence: 4, state: 'visible' },
    ]
    let enabled = createMissionFlowState(true)
    let disabled = createMissionFlowState(false)

    enabled = missionFlowReducer(enabled, facts[0]!)
    disabled = missionFlowReducer(disabled, facts[0]!)
    expect(
      enabled.diagnosticLog.filter(
        ({ category }) => category === 'visibilityChanged',
      ),
    ).toHaveLength(1)
    const hiddenLifecycle = enabled.lifecycle
    const hiddenLog = enabled.diagnosticLog

    enabled = missionFlowReducer(enabled, facts[1]!)
    disabled = missionFlowReducer(disabled, facts[1]!)
    expect(enabled.lifecycle).toBe(hiddenLifecycle)
    expect(enabled.pageVisibility).toBe('hidden')
    expect(enabled.diagnosticLog).toBe(hiddenLog)

    enabled = missionFlowReducer(enabled, facts[2]!)
    disabled = missionFlowReducer(disabled, facts[2]!)
    expect(
      enabled.diagnosticLog.filter(
        ({ category }) => category === 'visibilityChanged',
      ),
    ).toHaveLength(2)
    const visibleLifecycle = enabled.lifecycle
    const visibleLog = enabled.diagnosticLog

    enabled = missionFlowReducer(enabled, facts[3]!)
    disabled = missionFlowReducer(disabled, facts[3]!)
    expect(enabled.lifecycle).toBe(visibleLifecycle)
    expect(enabled.pageVisibility).toBe('visible')
    expect(enabled.diagnosticLog).toBe(visibleLog)
    expect({
      lifecycle: enabled.lifecycle,
      pageVisibility: enabled.pageVisibility,
    }).toEqual({
      lifecycle: disabled.lifecycle,
      pageVisibility: disabled.pageVisibility,
    })
  })

  it('derives the same sanitized patch without mutating either state', () => {
    const before = createMissionFlowState(false)
    const fact = connectedFact(100, 1)
    const after = missionFlowReducer(before, fact)
    const beforeSnapshot = structuredClone(before)
    const afterSnapshot = structuredClone(after)

    const patch = appendFlowDiagnostics({
      before,
      fact,
      after,
      occurrenceTime: 100,
      ignoredOutOfOrder: false,
      tuning: {
        plausibleBpm: { minimum: 30, maximum: 240 },
        warmupQualificationMs: 10_000,
      },
      limit: 1_000,
    })

    expect(patch).toEqual({
      diagnosticSessionStartMs: 100,
      diagnosticLastOccurrenceMs: 100,
      diagnosticLog: [
        {
          sequence: 1,
          occurrenceTimeMs: 0,
          category: 'connectionStatusChanged',
          details: { status: 'connected' },
          lifecycleBefore: 'preMission',
          lifecycleAfter: 'preMission',
          transportStatus: 'connected',
          signalQuality: 'unavailable',
          stableClassification: null,
        },
      ],
    })
    expect(before).toEqual(beforeSnapshot)
    expect(after).toEqual(afterSnapshot)
  })

  it('sanitizes ignored out-of-order facts and preserves monotonic ordering', () => {
    const initial = createMissionFlowState(false)
    const before: MissionFlowState = {
      ...initial,
      lastAppliedOccurrenceTimeMs: 200,
      lastAppliedSequence: 2,
      diagnosticSessionStartMs: 100,
      diagnosticLastOccurrenceMs: 200,
      diagnosticLog: [
        {
          sequence: 1,
          occurrenceTimeMs: 100,
          category: 'connectionStatusChanged',
          details: { status: 'connecting' },
          lifecycleBefore: 'preMission',
          lifecycleAfter: 'preMission',
          transportStatus: 'connecting',
          signalQuality: 'unavailable',
          stableClassification: null,
        },
      ],
    }
    const fact: MissionFlowFact = {
      type: 'sample',
      sequence: 3,
      sample: {
        occurrenceTimeMs: 150,
        bpm: 111,
        source: { id: 'private-device-id', type: 'bluetooth' },
      },
    }

    const patch = appendFlowDiagnostics({
      before,
      fact,
      after: before,
      occurrenceTime: 150,
      ignoredOutOfOrder: true,
      tuning: {
        plausibleBpm: { minimum: 30, maximum: 240 },
        warmupQualificationMs: 10_000,
      },
      limit: 1_000,
    })

    expect(patch?.diagnosticLog.at(-1)).toMatchObject({
      sequence: 2,
      occurrenceTimeMs: 100,
      category: 'ignoredOutOfOrderFact',
      details: {
        factType: 'sample',
        sequence: 3,
        occurrenceTimeMs: 150,
        lastAppliedSequence: 2,
        lastAppliedOccurrenceTimeMs: 200,
      },
    })
    expect(JSON.stringify(patch)).not.toContain('private-device-id')
  })

  it('keeps only the configured diagnostic-history tail', () => {
    const existing: FlowDiagnosticEntry[] = Array.from(
      { length: 3 },
      (_, index) => ({
        sequence: index + 1,
        occurrenceTimeMs: index,
        category: 'connectionStatusChanged',
        details: { status: 'connected' },
        lifecycleBefore: 'preMission',
        lifecycleAfter: 'preMission',
        transportStatus: 'connected',
        signalQuality: 'unavailable',
        stableClassification: null,
      }),
    )
    const initial = createMissionFlowState(false)
    const before: MissionFlowState = {
      ...initial,
      diagnosticLog: existing,
      diagnosticSessionStartMs: 0,
      diagnosticLastOccurrenceMs: 2,
    }
    const fact = connectedFact(3, 1)

    const patch = appendFlowDiagnostics({
      before,
      fact,
      after: missionFlowReducer(before, fact),
      occurrenceTime: 3,
      ignoredOutOfOrder: false,
      tuning: {
        plausibleBpm: { minimum: 30, maximum: 240 },
        warmupQualificationMs: 10_000,
      },
      limit: 3,
    })

    expect(patch?.diagnosticLog.map(({ sequence }) => sequence)).toEqual([
      2, 3, 4,
    ])
    expect(before.diagnosticLog).toBe(existing)
  })
})
