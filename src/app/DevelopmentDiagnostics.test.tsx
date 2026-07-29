import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { MonotonicClock } from '../platform/Clock'
import { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
import {
  createWarmupFlowState,
  warmupFlowReducer,
} from './WarmupFlowController'
import {
  createDiagnosticLogExport,
  serializeDiagnosticLog,
} from './diagnosticExport'
import { DevelopmentDiagnostics } from './DevelopmentDiagnostics'

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

describe('DevelopmentDiagnostics', () => {
  it('keeps one diagnostics surface without a second mission puzzle authority', () => {
    const clock: MonotonicClock = { now: () => 0 }
    render(
      <DevelopmentDiagnostics
        simulatedSource={new SimulatedHeartRateSource(clock)}
        state={createWarmupFlowState(true)}
        onResetDiagnostics={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Development diagnostics' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('group', {
        name: 'Three by three coolant-routing board',
      }),
    ).not.toBeInTheDocument()
  })

  it('controls source-owned continuous emission without owning its lifecycle', async () => {
    vi.useFakeTimers()
    const source = new SimulatedHeartRateSource({ now: () => 0 })
    const samples = vi.fn()
    source.subscribeSamples(samples)
    await source.connect()
    const view = render(
      <DevelopmentDiagnostics
        simulatedSource={source}
        state={createWarmupFlowState(true)}
        onResetDiagnostics={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start Samples' }))
    view.unmount()
    await vi.advanceTimersByTimeAsync(1_095)
    expect(samples).toHaveBeenCalledTimes(2)
    expect(source.getContinuousEmissionState().running).toBe(true)
    source.stopContinuousSamples()
    vi.useRealTimers()
  })
})
