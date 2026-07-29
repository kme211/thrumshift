import { describe, expect, it } from 'vitest'

import {
  createWarmupFlowState,
  warmupFlowReducer,
} from './WarmupFlowController'
import type { WarmupFlowFact, WarmupFlowState } from './WarmupFlowController'
import { appendFlowDiagnostics } from './FlowDiagnostics'
import type { WarmupTelemetryDiagnosticEntry } from './FlowDiagnostics'

function connectedFact(occurredAt: number, sequence: number): WarmupFlowFact {
  return {
    type: 'status',
    occurredAt,
    sequence,
    status: { state: 'connected' },
  }
}

describe('flow diagnostics', () => {
  it('derives the same sanitized patch without mutating either state', () => {
    const before = createWarmupFlowState(false)
    const fact = connectedFact(100, 1)
    const after = warmupFlowReducer(before, fact)
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
    const initial = createWarmupFlowState(false)
    const before: WarmupFlowState = {
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
    const fact: WarmupFlowFact = {
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
    const existing: WarmupTelemetryDiagnosticEntry[] = Array.from(
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
    const initial = createWarmupFlowState(false)
    const before: WarmupFlowState = {
      ...initial,
      diagnosticLog: existing,
      diagnosticSessionStartMs: 0,
      diagnosticLastOccurrenceMs: 2,
    }
    const fact = connectedFact(3, 1)

    const patch = appendFlowDiagnostics({
      before,
      fact,
      after: warmupFlowReducer(before, fact),
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
