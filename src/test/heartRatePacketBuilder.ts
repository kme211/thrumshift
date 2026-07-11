interface HeartRatePacketOptions {
  readonly bpm: number
  readonly useUint16?: boolean
  readonly energyExpended?: number
  readonly rrIntervalsRaw?: readonly number[]
}

export function buildHeartRatePacket({
  bpm,
  useUint16 = false,
  energyExpended,
  rrIntervalsRaw,
}: HeartRatePacketOptions): DataView {
  const includesEnergy = energyExpended !== undefined
  const includesRrIntervals = rrIntervalsRaw !== undefined
  const heartRateBytes = useUint16 ? 2 : 1
  const bytes = new Uint8Array(
    1 +
      heartRateBytes +
      (includesEnergy ? 2 : 0) +
      (rrIntervalsRaw?.length ?? 0) * 2,
  )
  const view = new DataView(bytes.buffer)

  let flags = useUint16 ? 0b0000_0001 : 0
  flags |= includesEnergy ? 0b0000_1000 : 0
  flags |= includesRrIntervals ? 0b0001_0000 : 0
  view.setUint8(0, flags)

  let offset = 1
  if (useUint16) {
    view.setUint16(offset, bpm, true)
    offset += 2
  } else {
    view.setUint8(offset, bpm)
    offset += 1
  }

  if (energyExpended !== undefined) {
    view.setUint16(offset, energyExpended, true)
    offset += 2
  }

  for (const rrInterval of rrIntervalsRaw ?? []) {
    view.setUint16(offset, rrInterval, true)
    offset += 2
  }

  return view
}
