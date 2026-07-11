export type HeartRateSourceType = 'simulated' | 'bluetooth'

export interface HeartRateSourceIdentity {
  readonly id: string
  readonly type: HeartRateSourceType
}

export interface HeartRateSample {
  readonly occurrenceTimeMs: number
  readonly bpm: number
  readonly source: HeartRateSourceIdentity
  readonly rrIntervalsMs?: readonly number[]
}
