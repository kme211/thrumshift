import { isValidHeartRateBpm } from '../../domain/heart-rate/range'

const HEART_RATE_UINT16_FLAG = 0b0000_0001
const ENERGY_EXPENDED_PRESENT_FLAG = 0b0000_1000
const RR_INTERVAL_PRESENT_FLAG = 0b0001_0000
const RR_INTERVAL_UNIT_MS = 1_000 / 1_024

export interface ParsedHeartRateMeasurement {
  readonly bpm: number
  readonly rrIntervalsMs?: readonly number[]
}

export type HeartRateMeasurementParseFailureCode =
  | 'missing-flags'
  | 'truncated-heart-rate'
  | 'invalid-heart-rate'
  | 'truncated-energy-expended'
  | 'truncated-rr-interval'

export type HeartRateMeasurementParseResult =
  | { readonly ok: true; readonly value: ParsedHeartRateMeasurement }
  | {
      readonly ok: false
      readonly error: { readonly code: HeartRateMeasurementParseFailureCode }
    }

function failure(
  code: HeartRateMeasurementParseFailureCode,
): HeartRateMeasurementParseResult {
  return { ok: false, error: { code } }
}

export function parseHeartRateMeasurement(
  packet: DataView,
): HeartRateMeasurementParseResult {
  if (packet.byteLength < 1) {
    return failure('missing-flags')
  }

  const flags = packet.getUint8(0)
  const usesUint16HeartRate = (flags & HEART_RATE_UINT16_FLAG) !== 0
  const heartRateByteLength = usesUint16HeartRate ? 2 : 1
  let offset = 1

  if (packet.byteLength < offset + heartRateByteLength) {
    return failure('truncated-heart-rate')
  }

  const bpm = usesUint16HeartRate
    ? packet.getUint16(offset, true)
    : packet.getUint8(offset)
  offset += heartRateByteLength

  if (!isValidHeartRateBpm(bpm)) {
    return failure('invalid-heart-rate')
  }

  if ((flags & ENERGY_EXPENDED_PRESENT_FLAG) !== 0) {
    if (packet.byteLength < offset + 2) {
      return failure('truncated-energy-expended')
    }
    offset += 2
  }

  if ((flags & RR_INTERVAL_PRESENT_FLAG) === 0) {
    return { ok: true, value: { bpm } }
  }

  const remainingBytes = packet.byteLength - offset
  if (remainingBytes < 2 || remainingBytes % 2 !== 0) {
    return failure('truncated-rr-interval')
  }

  const rrIntervalsMs: number[] = []
  while (offset < packet.byteLength) {
    rrIntervalsMs.push(packet.getUint16(offset, true) * RR_INTERVAL_UNIT_MS)
    offset += 2
  }

  return { ok: true, value: { bpm, rrIntervalsMs } }
}
