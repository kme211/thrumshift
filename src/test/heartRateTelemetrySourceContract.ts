import { describe, expect, it, vi } from 'vitest'

import type { HeartRateTelemetrySource } from '../telemetry/HeartRateTelemetrySource'

interface HeartRateTelemetrySourceHarness {
  readonly source: HeartRateTelemetrySource
  emitSample(): void | Promise<void>
}

export function runHeartRateTelemetrySourceContract(
  sourceName: string,
  createHarness: () => HeartRateTelemetrySourceHarness,
): void {
  describe(`${sourceName} telemetry source contract`, () => {
    it('publishes its initial status and an idempotent connection lifecycle', async () => {
      const { source } = createHarness()
      const listener = vi.fn()
      source.subscribeStatus(listener)

      await source.connect()
      await source.connect()
      await source.disconnect()
      await source.disconnect()

      expect(listener.mock.calls.map(([status]) => status)).toEqual([
        { state: 'disconnected' },
        { state: 'connecting' },
        { state: 'connected' },
        { state: 'disconnected' },
      ])
    })

    it('delivers samples only while connected', async () => {
      const { source, emitSample } = createHarness()
      const listener = vi.fn()
      source.subscribeSamples(listener)

      await emitSample()
      await source.connect()
      await emitSample()
      await source.disconnect()
      await emitSample()

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('stops status and sample delivery after unsubscription', async () => {
      const { source, emitSample } = createHarness()
      const statusListener = vi.fn()
      const sampleListener = vi.fn()
      const unsubscribeStatus = source.subscribeStatus(statusListener)
      const unsubscribeSamples = source.subscribeSamples(sampleListener)

      unsubscribeStatus()
      unsubscribeSamples()
      await source.connect()
      await emitSample()

      expect(statusListener).toHaveBeenCalledTimes(1)
      expect(sampleListener).not.toHaveBeenCalled()
    })

    it('cleans up idempotently and ignores late work after disposal', async () => {
      const { source, emitSample } = createHarness()
      const statusListener = vi.fn()
      const sampleListener = vi.fn()
      source.subscribeStatus(statusListener)
      source.subscribeSamples(sampleListener)

      source.dispose()
      source.dispose()
      await source.connect()
      await source.disconnect()
      await emitSample()

      expect(statusListener).toHaveBeenCalledTimes(1)
      expect(sampleListener).not.toHaveBeenCalled()
      expect(source.getStatus()).toEqual({ state: 'disconnected' })
    })
  })
}
