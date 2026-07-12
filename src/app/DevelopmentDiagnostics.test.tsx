import { describe, expect, it } from 'vitest'

import {
  createWarmupFlowState,
  warmupFlowReducer,
} from './WarmupFlowController'
import {
  createDiagnosticLogExport,
  serializeDiagnosticLog,
} from './diagnosticExport'

describe('development diagnostic export', () => {
  it('exports serializable schema-versioned environment, configuration, state, and events', () => {
    let state = createWarmupFlowState(true)
    state = warmupFlowReducer(state, {
      type: 'status',
      occurredAt: 42,
      sequence: 1,
      status: { state: 'connected' },
    })
    const diagnosticExport = createDiagnosticLogExport(
      state,
      {
        appVersion: 'test',
        userAgent: 'test browser',
        secureContext: true,
        bluetoothSupported: true,
        visibilityState: 'visible',
      },
      '2026-07-12T12:00:00.000Z',
    )
    const exported = serializeDiagnosticLog(diagnosticExport)
    const parsed = JSON.parse(exported) as Record<string, unknown>

    expect(parsed).toMatchObject({
      schemaVersion: 1,
      exportedAt: '2026-07-12T12:00:00.000Z',
      environment: {
        appVersion: 'test',
        userAgent: 'test browser',
        secureContext: true,
        bluetoothSupported: true,
        visibilityState: 'visible',
      },
      currentState: {
        lifecycle: 'preMission',
        transportStatus: 'connected',
        signalQuality: 'unavailable',
      },
      events: [{ sequence: 1, occurrenceTimeMs: 0 }],
    })
    expect(parsed).toHaveProperty('configuration.classifierTuning')
    expect(() => JSON.stringify(diagnosticExport)).not.toThrow()
  })
})
