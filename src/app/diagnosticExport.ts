import { defaultGameplayTuning } from '../config/gameplayTuning'
import type { TargetRange } from '../domain/heart-rate/classifier'
import {
  getCountdownRemainingMs,
  getWarmupProgressMs,
} from '../domain/mission/warmup'
import type {
  WarmupFlowState,
  WarmupTelemetryDiagnosticEntry,
} from './WarmupFlowController'
import { getWarmupDiagnosticSession } from './FlowDiagnostics'

export interface DiagnosticEnvironment {
  readonly appVersion?: string
  readonly userAgent: string
  readonly secureContext: boolean
  readonly bluetoothSupported: boolean
  readonly visibilityState: DocumentVisibilityState
}

export interface DiagnosticLogExport {
  readonly schemaVersion: 1
  readonly exportedAt: string
  readonly environment: DiagnosticEnvironment
  readonly configuration: {
    readonly targetRange: TargetRange
    readonly classifierTuning: typeof defaultGameplayTuning.heartRateClassifier
  }
  readonly currentState: {
    readonly lifecycle: string
    readonly transportStatus: string
    readonly signalQuality: string
    readonly latestBpm: number | null
    readonly stableClassification: string | null
    readonly warmupProgressMs: number
    readonly countdownRemainingMs: number | null
  }
  readonly events: readonly WarmupTelemetryDiagnosticEntry[]
}

export function createDiagnosticLogExport(
  state: WarmupFlowState,
  environment: DiagnosticEnvironment,
  exportedAt = new Date().toISOString(),
): DiagnosticLogExport {
  const session = getWarmupDiagnosticSession(state)
  return {
    schemaVersion: 1,
    exportedAt,
    environment,
    configuration: {
      targetRange: state.targetRange,
      classifierTuning: defaultGameplayTuning.heartRateClassifier,
    },
    currentState: {
      lifecycle: state.lifecycle.phase,
      transportStatus: state.telemetryStatus.state,
      signalQuality: session?.classifier.signalQuality ?? 'unavailable',
      latestBpm:
        session?.classifier.latestValidBpm ?? state.latestPreMissionBpm,
      stableClassification: session?.classifier.stableClassification ?? null,
      warmupProgressMs:
        session === null
          ? 0
          : getWarmupProgressMs(
              session.warmup,
              defaultGameplayTuning.warmup.qualificationMs,
            ),
      countdownRemainingMs:
        session === null
          ? null
          : getCountdownRemainingMs(
              session.warmup,
              defaultGameplayTuning.countdown.durationMs,
            ),
    },
    events: state.diagnosticLog,
  }
}

export function serializeDiagnosticLog(
  diagnosticExport: DiagnosticLogExport,
): string {
  return JSON.stringify(diagnosticExport, null, 2)
}

export function downloadDiagnosticLog(
  state: WarmupFlowState,
  environment: DiagnosticEnvironment,
): void {
  const url = URL.createObjectURL(
    new Blob(
      [serializeDiagnosticLog(createDiagnosticLogExport(state, environment))],
      {
        type: 'application/json',
      },
    ),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'thrumshift-diagnostic-log.json'
  link.click()
  URL.revokeObjectURL(url)
}
