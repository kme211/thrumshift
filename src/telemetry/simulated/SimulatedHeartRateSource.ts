import { isValidHeartRateBpm } from '../../domain/heart-rate/range'
import type {
  HeartRateSample,
  HeartRateSourceIdentity,
} from '../../domain/heart-rate/types'
import type { MonotonicClock } from '../../platform/Clock'
import type {
  HeartRateTelemetrySource,
  TelemetryCapability,
  TelemetrySourceStatus,
  Unsubscribe,
} from '../HeartRateTelemetrySource'

export interface SimulatedScriptPoint {
  readonly offsetMs: number
  readonly bpm: number
  readonly rrIntervalsMs?: readonly number[]
}

export class SimulatedHeartRateSource implements HeartRateTelemetrySource {
  readonly identity: HeartRateSourceIdentity
  readonly capability: TelemetryCapability = { supported: true }

  private status: TelemetrySourceStatus = { state: 'disconnected' }
  private readonly statusListeners = new Set<
    (status: TelemetrySourceStatus) => void
  >()
  private readonly sampleListeners = new Set<
    (sample: HeartRateSample) => void
  >()
  private disposed = false

  constructor(
    private readonly clock: MonotonicClock,
    id = 'simulated-heart-rate',
  ) {
    this.identity = { id, type: 'simulated' }
  }

  getStatus(): TelemetrySourceStatus {
    return this.status
  }

  subscribeStatus(
    listener: (status: TelemetrySourceStatus) => void,
  ): Unsubscribe {
    if (this.disposed) {
      return () => undefined
    }
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  subscribeSamples(listener: (sample: HeartRateSample) => void): Unsubscribe {
    if (this.disposed) {
      return () => undefined
    }
    this.sampleListeners.add(listener)
    return () => this.sampleListeners.delete(listener)
  }

  async connect(): Promise<void> {
    if (this.disposed || this.status.state === 'connected') {
      return
    }
    this.publishStatus({ state: 'connecting' })
    this.publishStatus({ state: 'connected' })
  }

  async disconnect(): Promise<void> {
    if (this.disposed || this.status.state === 'disconnected') {
      return
    }
    this.publishStatus({ state: 'disconnected' })
  }

  emitSample(bpm: number, rrIntervalsMs?: readonly number[]): void {
    this.publishSample(this.clock.now(), bpm, rrIntervalsMs)
  }

  emitScript(points: readonly SimulatedScriptPoint[]): void {
    const startTime = this.clock.now()
    let previousOffset = -1

    for (const point of points) {
      if (
        !Number.isFinite(point.offsetMs) ||
        point.offsetMs < 0 ||
        point.offsetMs < previousOffset
      ) {
        throw new RangeError(
          'Script offsets must be finite, nonnegative, and ordered',
        )
      }
      this.publishSample(
        startTime + point.offsetMs,
        point.bpm,
        point.rrIntervalsMs,
      )
      previousOffset = point.offsetMs
    }
  }

  emitError(message: string): void {
    if (this.disposed) {
      return
    }
    this.publishStatus({
      state: 'error',
      error: { code: 'source-error', message },
    })
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.status = { state: 'disconnected' }
    this.statusListeners.clear()
    this.sampleListeners.clear()
  }

  private publishStatus(status: TelemetrySourceStatus): void {
    if (this.disposed) {
      return
    }
    this.status = status
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }

  private publishSample(
    occurrenceTimeMs: number,
    bpm: number,
    rrIntervalsMs?: readonly number[],
  ): void {
    if (this.disposed || this.status.state !== 'connected') {
      return
    }
    if (!isValidHeartRateBpm(bpm)) {
      this.emitError('Simulator received an invalid BPM value')
      return
    }
    if (!Number.isFinite(occurrenceTimeMs) || occurrenceTimeMs < 0) {
      this.emitError('Simulator clock returned an invalid occurrence time')
      return
    }
    if (
      rrIntervalsMs?.some(
        (interval) => !Number.isFinite(interval) || interval <= 0,
      )
    ) {
      this.emitError('Simulator received an invalid RR interval')
      return
    }

    const sample: HeartRateSample = {
      occurrenceTimeMs,
      bpm,
      source: this.identity,
      ...(rrIntervalsMs === undefined
        ? {}
        : { rrIntervalsMs: [...rrIntervalsMs] }),
    }
    for (const listener of this.sampleListeners) {
      listener(sample)
    }
  }
}
