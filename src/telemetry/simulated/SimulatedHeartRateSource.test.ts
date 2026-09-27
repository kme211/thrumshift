import { describe, expect, it, vi } from 'vitest'

import { runHeartRateTelemetrySourceContract } from '../../test/heartRateTelemetrySourceContract'
import { SimulatedHeartRateSource } from './SimulatedHeartRateSource'

function createClock(initialTime = 0) {
  let time = initialTime
  return {
    clock: { now: () => time },
    setTime: (nextTime: number) => {
      time = nextTime
    },
  }
}

runHeartRateTelemetrySourceContract('SimulatedHeartRateSource', () => {
  const source = new SimulatedHeartRateSource({ now: () => 100 })
  return {
    source,
    emitSample: () => source.emitSample(72),
  }
})

describe('SimulatedHeartRateSource', () => {
  it('emits continuously at the configured cadence and uses BPM changes', async () => {
    vi.useFakeTimers()
    let time = 0
    const source = new SimulatedHeartRateSource({ now: () => time })
    const samples = vi.fn()
    source.subscribeSamples(samples)
    await source.connect()

    source.startContinuousSamples(72, 1_095)
    expect(samples).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: 72 }),
    )
    source.setContinuousBpm(88)
    expect(samples).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: 88, occurrenceTimeMs: 0 }),
    )
    time = 1_095
    await vi.advanceTimersByTimeAsync(1_095)

    expect(samples).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: 88, occurrenceTimeMs: 1_095 }),
    )
    expect(source.getContinuousEmissionState()).toEqual({
      running: true,
      bpm: 88,
      cadenceMs: 1_095,
    })
    expect(samples).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('stop and disconnect cancel continuous emissions', async () => {
    vi.useFakeTimers()
    const source = new SimulatedHeartRateSource({ now: () => 0 })
    const samples = vi.fn()
    source.subscribeSamples(samples)
    await source.connect()
    source.startContinuousSamples(72, 100)
    source.stopContinuousSamples()
    await vi.advanceTimersByTimeAsync(500)
    expect(samples).toHaveBeenCalledTimes(1)

    source.startContinuousSamples(72, 100)
    await source.disconnect()
    await vi.advanceTimersByTimeAsync(500)
    expect(samples).toHaveBeenCalledTimes(2)
    expect(source.getContinuousEmissionState().running).toBe(false)
    vi.useRealTimers()
  })

  it('restart keeps one schedule and rejects callbacks from old generations', async () => {
    let nextHandle = 0
    const callbacks = new Map<number, () => void>()
    const clearedCallbacks: (() => void)[] = []
    const source = new SimulatedHeartRateSource(
      { now: () => 0 },
      'simulated-heart-rate',
      {
        setTimeout(callback) {
          callbacks.set(++nextHandle, callback)
          return nextHandle
        },
        clearTimeout(handle) {
          const callback = callbacks.get(handle as number)
          if (callback !== undefined) clearedCallbacks.push(callback)
          callbacks.delete(handle as number)
        },
      },
    )
    const samples = vi.fn()
    source.subscribeSamples(samples)
    await source.connect()
    source.startContinuousSamples(70, 100)
    source.startContinuousSamples(80, 200)

    expect(callbacks.size).toBe(1)
    for (const callback of clearedCallbacks) callback()
    expect(samples).toHaveBeenCalledTimes(2)
    expect(samples).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: 80 }),
    )
  })

  it('disposal cancels pending callbacks and blocks stale generations', async () => {
    vi.useFakeTimers()
    const source = new SimulatedHeartRateSource({ now: () => 0 })
    const samples = vi.fn()
    source.subscribeSamples(samples)
    await source.connect()
    source.startContinuousSamples(72, 100)
    source.dispose()
    await vi.advanceTimersByTimeAsync(500)
    expect(samples).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('publishes the current status followed by deterministic connection states', async () => {
    const { clock } = createClock()
    const source = new SimulatedHeartRateSource(clock)
    const listener = vi.fn()
    source.subscribeStatus(listener)

    await source.connect()

    expect(listener.mock.calls.map(([status]) => status)).toEqual([
      { state: 'disconnected' },
      { state: 'connecting' },
      { state: 'connected' },
    ])
  })

  it('emits immutable app-level samples using the injected clock', async () => {
    const { clock, setTime } = createClock(100)
    const source = new SimulatedHeartRateSource(clock, 'test-source')
    const listener = vi.fn()
    source.subscribeSamples(listener)
    await source.connect()
    setTime(250)

    source.emitSample(72, [800, 810])

    expect(listener).toHaveBeenCalledWith({
      occurrenceTimeMs: 250,
      bpm: 72,
      source: { id: 'test-source', type: 'simulated' },
      rrIntervalsMs: [800, 810],
    })
  })

  it('emits an immediate deterministic script without timers', async () => {
    const { clock } = createClock(1_000)
    const source = new SimulatedHeartRateSource(clock)
    const listener = vi.fn()
    source.subscribeSamples(listener)
    await source.connect()

    source.emitScript([
      { offsetMs: 0, bpm: 65 },
      { offsetMs: 500, bpm: 70 },
      { offsetMs: 1_500, bpm: 75, rrIntervalsMs: [800] },
    ])

    expect(listener.mock.calls.map(([sample]) => sample)).toEqual([
      expect.objectContaining({ occurrenceTimeMs: 1_000, bpm: 65 }),
      expect.objectContaining({ occurrenceTimeMs: 1_500, bpm: 70 }),
      expect.objectContaining({
        occurrenceTimeMs: 2_500,
        bpm: 75,
        rrIntervalsMs: [800],
      }),
    ])
  })

  it('supports disconnect, reconnect, errors, and listener cleanup', async () => {
    const { clock } = createClock()
    const source = new SimulatedHeartRateSource(clock)
    const statuses = vi.fn()
    const samples = vi.fn()
    const unsubscribeStatus = source.subscribeStatus(statuses)
    const unsubscribeSamples = source.subscribeSamples(samples)

    await source.connect()
    await source.disconnect()
    source.emitSample(70)
    await source.connect()
    source.emitError('scripted failure')
    unsubscribeStatus()
    unsubscribeSamples()
    await source.connect()
    source.emitSample(80)

    expect(statuses).toHaveBeenLastCalledWith({
      state: 'error',
      error: { code: 'source-error', message: 'scripted failure' },
    })
    expect(samples).not.toHaveBeenCalled()
  })

  it('rejects invalid simulator input safely', async () => {
    const { clock } = createClock()
    const source = new SimulatedHeartRateSource(clock)
    const statuses = vi.fn()
    source.subscribeStatus(statuses)
    await source.connect()

    source.emitSample(0)

    expect(source.getStatus()).toEqual({
      state: 'error',
      error: {
        code: 'source-error',
        message: 'Simulator received an invalid BPM value',
      },
    })
    expect(() => source.emitScript([{ offsetMs: -1, bpm: 70 }])).toThrow(
      RangeError,
    )
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'reports an invalid injected clock value of %s',
    async (time) => {
      const source = new SimulatedHeartRateSource({ now: () => time })
      await source.connect()

      source.emitSample(70)

      expect(source.getStatus()).toEqual({
        state: 'error',
        error: {
          code: 'source-error',
          message: 'Simulator clock returned an invalid occurrence time',
        },
      })
    },
  )

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'reports an invalid RR interval of %s',
    async (rrInterval) => {
      const { clock } = createClock()
      const source = new SimulatedHeartRateSource(clock)
      await source.connect()

      source.emitSample(70, [rrInterval])

      expect(source.getStatus()).toEqual({
        state: 'error',
        error: {
          code: 'source-error',
          message: 'Simulator received an invalid RR interval',
        },
      })
    },
  )

  it.each([
    [[{ offsetMs: Number.NaN, bpm: 70 }]],
    [[{ offsetMs: Number.POSITIVE_INFINITY, bpm: 70 }]],
    [
      [
        { offsetMs: 2, bpm: 70 },
        { offsetMs: 1, bpm: 71 },
      ],
    ],
  ] as const)('rejects non-finite or unordered script offsets', (points) => {
    const { clock } = createClock()
    const source = new SimulatedHeartRateSource(clock)

    expect(() => source.emitScript(points)).toThrow(
      new RangeError('Script offsets must be finite, nonnegative, and ordered'),
    )
  })

  it('makes disposal idempotent and ignores late operations', async () => {
    const { clock } = createClock()
    const source = new SimulatedHeartRateSource(clock)
    const listener = vi.fn()
    source.subscribeStatus(listener)

    source.dispose()
    source.dispose()
    await source.connect()
    source.emitSample(70)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(source.getStatus()).toEqual({ state: 'disconnected' })
  })

  it('ignores subscriptions and errors created after disposal', () => {
    const { clock } = createClock()
    const source = new SimulatedHeartRateSource(clock)
    const statusListener = vi.fn()
    const sampleListener = vi.fn()
    source.dispose()

    const unsubscribeStatus = source.subscribeStatus(statusListener)
    const unsubscribeSamples = source.subscribeSamples(sampleListener)
    source.emitError('late error')
    unsubscribeStatus()
    unsubscribeSamples()

    expect(statusListener).not.toHaveBeenCalled()
    expect(sampleListener).not.toHaveBeenCalled()
    expect(source.getStatus()).toEqual({ state: 'disconnected' })
  })
})
