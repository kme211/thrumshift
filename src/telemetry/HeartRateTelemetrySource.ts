import type {
  HeartRateSample,
  HeartRateSourceIdentity,
} from '../domain/heart-rate/types'

export type TelemetryCapability =
  | { readonly supported: true }
  | {
      readonly supported: false
      readonly reason: 'unsupported' | 'insecure-context'
    }

export interface TelemetrySourceError {
  readonly code: 'source-error'
  readonly message: string
}

export type TelemetrySourceStatus =
  | { readonly state: 'disconnected' }
  | { readonly state: 'connecting' }
  | { readonly state: 'connected' }
  | { readonly state: 'error'; readonly error: TelemetrySourceError }

export type Unsubscribe = () => void

export interface HeartRateTelemetrySource {
  readonly identity: HeartRateSourceIdentity
  readonly capability: TelemetryCapability

  getStatus(): TelemetrySourceStatus
  subscribeStatus(
    listener: (status: TelemetrySourceStatus) => void,
  ): Unsubscribe
  subscribeSamples(listener: (sample: HeartRateSample) => void): Unsubscribe
  connect(): Promise<void>
  disconnect(): Promise<void>
  dispose(): void
}
