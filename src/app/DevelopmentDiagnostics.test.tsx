import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { MonotonicClock } from '../platform/Clock'
import { defaultGameplayTuning } from '../config/gameplayTuning'
import { createClassifierState } from '../domain/heart-rate/classifier'
import { SimulatedHeartRateSource } from '../telemetry/simulated/SimulatedHeartRateSource'
import { createMissionRun } from './MissionRun'
import {
  createMissionFlowState,
  missionFlowReducer,
} from './MissionFlowController'
import type { MissionFlowState } from './MissionFlowController'
import {
  createDiagnosticLogExport,
  serializeDiagnosticLog,
} from './diagnosticExport'
import { DevelopmentDiagnostics } from './DevelopmentDiagnostics'

describe('development diagnostic export', () => {
  it('exports serializable schema-versioned environment, configuration, state, and events', () => {
    let state = createMissionFlowState(true)
    state = missionFlowReducer(state, {
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
  it('exposes exact canonical active-mission values without display rounding', () => {
    const base = createMissionFlowState(true)
    const run = createMissionRun(
      0,
      base.targetRange,
      createClassifierState(0),
      defaultGameplayTuning,
    )
    const exactRun = {
      ...run,
      session: {
        ...run.session,
        mission: {
          ...run.session.mission,
          activeElapsedTimeMs: 1_234,
          stability: 72.345_678_9,
        },
        statistics: {
          ...run.session.statistics,
          completedDurationsMs: {
            ...run.session.statistics.completedDurationsMs,
            belowRange: 101,
            operational: 202,
            aboveRange: 303,
          },
        },
      },
    }
    const state: MissionFlowState = {
      ...base,
      lifecycle: {
        phase: 'activeMission',
        runId: 'diagnostic-test',
        mission: exactRun,
      },
      telemetryStatus: { state: 'connected' },
    }
    render(
      <DevelopmentDiagnostics
        simulatedSource={new SimulatedHeartRateSource({ now: () => 0 })}
        state={state}
        onResetDiagnostics={vi.fn()}
      />,
    )

    const diagnostics = screen
      .getByRole('heading', { name: 'Development diagnostics' })
      .closest('aside')
    const values = diagnostics?.querySelector('dl')
    expect(diagnostics).toHaveAttribute('data-telemetry-status', 'connected')
    expect(values).toHaveAttribute('data-mission-active-elapsed-ms', '1234')
    expect(values).toHaveAttribute(
      'data-mission-duration-below-range-ms',
      '101',
    )
    expect(values).toHaveAttribute(
      'data-mission-duration-operational-ms',
      '202',
    )
    expect(values).toHaveAttribute(
      'data-mission-duration-above-range-ms',
      '303',
    )
    expect(values).toHaveAttribute(
      'data-mission-hint-eligibility-ms',
      String(run.hintEligibilityMs),
    )
    expect(values).toHaveAttribute('data-mission-stability', '72.3456789')
  })

  it('keeps one diagnostics surface without a second mission puzzle authority', () => {
    const clock: MonotonicClock = { now: () => 0 }
    render(
      <DevelopmentDiagnostics
        simulatedSource={new SimulatedHeartRateSource(clock)}
        state={createMissionFlowState(true)}
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
        state={createMissionFlowState(true)}
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
