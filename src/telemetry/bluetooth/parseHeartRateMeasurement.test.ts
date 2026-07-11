import { describe, expect, it } from 'vitest'

import { buildHeartRatePacket } from '../../test/heartRatePacketBuilder'
import { parseHeartRateMeasurement } from './parseHeartRateMeasurement'

describe('parseHeartRateMeasurement', () => {
  it('parses an 8-bit heart rate without optional fields', () => {
    expect(
      parseHeartRateMeasurement(buildHeartRatePacket({ bpm: 72 })),
    ).toEqual({
      ok: true,
      value: { bpm: 72 },
    })
  })

  it('parses a 16-bit heart rate as little-endian', () => {
    expect(
      parseHeartRateMeasurement(
        buildHeartRatePacket({ bpm: 300, useUint16: true }),
      ),
    ).toEqual({ ok: true, value: { bpm: 300 } })
  })

  it('preserves one RR interval converted from 1/1024 seconds to milliseconds', () => {
    expect(
      parseHeartRateMeasurement(
        buildHeartRatePacket({ bpm: 60, rrIntervalsRaw: [1_024] }),
      ),
    ).toEqual({ ok: true, value: { bpm: 60, rrIntervalsMs: [1_000] } })
  })

  it('preserves multiple RR intervals after the energy-expended field', () => {
    expect(
      parseHeartRateMeasurement(
        buildHeartRatePacket({
          bpm: 80,
          energyExpended: 321,
          rrIntervalsRaw: [512, 768, 1_024],
        }),
      ),
    ).toEqual({
      ok: true,
      value: { bpm: 80, rrIntervalsMs: [500, 750, 1_000] },
    })
  })

  it.each([
    [new Uint8Array([]), 'missing-flags'],
    [new Uint8Array([0b0000_0001, 1]), 'truncated-heart-rate'],
    [new Uint8Array([0, 0]), 'invalid-heart-rate'],
    [new Uint8Array([0b0000_1000, 70, 1]), 'truncated-energy-expended'],
    [new Uint8Array([0b0001_0000, 70]), 'truncated-rr-interval'],
    [new Uint8Array([0b0001_0000, 70, 1, 0, 2]), 'truncated-rr-interval'],
  ] as const)('rejects malformed packet %# with %s', (bytes, expectedCode) => {
    expect(parseHeartRateMeasurement(new DataView(bytes.buffer))).toEqual({
      ok: false,
      error: { code: expectedCode },
    })
  })
})
