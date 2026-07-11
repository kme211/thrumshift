import { describe, expect, it, vi } from 'vitest'

import { buildHeartRatePacket } from '../../test/heartRatePacketBuilder'
import { runHeartRateTelemetrySourceContract } from '../../test/heartRateTelemetrySourceContract'
import type {
  BluetoothCharacteristicPort,
  BluetoothDevicePort,
  BluetoothEventListener,
  BluetoothGattPort,
  BluetoothPort,
  BluetoothRequestDeviceOptions,
  BluetoothServerPort,
  BluetoothServicePort,
} from './bluetoothPorts'
import {
  HEART_RATE_MEASUREMENT_CHARACTERISTIC,
  HEART_RATE_SERVICE,
} from './bluetoothPorts'
import { WebBluetoothHeartRateSource } from './WebBluetoothHeartRateSource'

class FakeCharacteristic implements BluetoothCharacteristicPort {
  value: DataView | null = null
  readonly listeners = new Set<BluetoothEventListener>()
  readonly startNotifications = vi.fn(async () => undefined)
  readonly stopNotifications = vi.fn(async () => undefined)

  addEventListener(
    type: 'characteristicvaluechanged',
    listener: BluetoothEventListener,
  ): void {
    if (type === 'characteristicvaluechanged') {
      this.listeners.add(listener)
    }
  }

  removeEventListener(
    type: 'characteristicvaluechanged',
    listener: BluetoothEventListener,
  ): void {
    if (type === 'characteristicvaluechanged') {
      this.listeners.delete(listener)
    }
  }

  notify(value: DataView): void {
    this.value = value
    for (const listener of this.listeners) {
      listener()
    }
  }
}

class FakeDevice implements BluetoothDevicePort {
  readonly disconnectListeners = new Set<BluetoothEventListener>()

  constructor(public gatt: BluetoothGattPort | null | undefined) {}

  addEventListener(
    type: 'gattserverdisconnected',
    listener: BluetoothEventListener,
  ): void {
    if (type === 'gattserverdisconnected') {
      this.disconnectListeners.add(listener)
    }
  }

  removeEventListener(
    type: 'gattserverdisconnected',
    listener: BluetoothEventListener,
  ): void {
    if (type === 'gattserverdisconnected') {
      this.disconnectListeners.delete(listener)
    }
  }

  disconnectUnexpectedly(): void {
    for (const listener of [...this.disconnectListeners]) {
      listener()
    }
  }
}

function createFixture() {
  const characteristic = new FakeCharacteristic()
  const service: BluetoothServicePort = {
    getCharacteristic: vi.fn(async () => characteristic),
  }
  const server: BluetoothServerPort = {
    getPrimaryService: vi.fn(async () => service),
  }
  const gatt: BluetoothGattPort & { connected: boolean } = {
    connected: false,
    connect: vi.fn(async () => {
      gatt.connected = true
      return server
    }),
    disconnect: vi.fn(() => {
      gatt.connected = false
    }),
  }
  const device = new FakeDevice(gatt)
  const bluetooth: BluetoothPort = {
    requestDevice: vi.fn(async () => device),
  }
  const source = new WebBluetoothHeartRateSource(
    { isSecureContext: true, bluetooth },
    { now: () => 1_234 },
  )

  return {
    bluetooth,
    characteristic,
    service,
    server,
    gatt,
    device,
    source,
  }
}

async function flushNotification(): Promise<void> {
  await Promise.resolve()
}

runHeartRateTelemetrySourceContract('WebBluetoothHeartRateSource', () => {
  const fixture = createFixture()
  return {
    source: fixture.source,
    emitSample: async () => {
      fixture.characteristic.notify(buildHeartRatePacket({ bpm: 72 }))
      await flushNotification()
    },
  }
})

describe('WebBluetoothHeartRateSource', () => {
  it.each([
    ['unsupported', { isSecureContext: true }],
    [
      'insecure-context',
      { isSecureContext: false, bluetooth: createFixture().bluetooth },
    ],
  ] as const)(
    'reports %s capability errors without opening a chooser',
    async (expectedCode, environment) => {
      const source = new WebBluetoothHeartRateSource(environment, {
        now: () => 0,
      })

      await source.connect()

      expect(source.getStatus()).toEqual(
        expect.objectContaining({
          state: 'error',
          error: expect.objectContaining({ code: expectedCode }),
        }),
      )
      if ('bluetooth' in environment) {
        expect(environment.bluetooth.requestDevice).not.toHaveBeenCalled()
      }
    },
  )

  it('requests the standard service and subscribes to the measurement characteristic', async () => {
    const fixture = createFixture()
    const samples = vi.fn()
    fixture.source.subscribeSamples(samples)

    await fixture.source.connect()
    fixture.characteristic.notify(buildHeartRatePacket({ bpm: 72 }))
    await flushNotification()

    expect(fixture.bluetooth.requestDevice).toHaveBeenCalledWith({
      filters: [{ services: [HEART_RATE_SERVICE] }],
    } satisfies BluetoothRequestDeviceOptions)
    expect(fixture.server.getPrimaryService).toHaveBeenCalledWith(
      HEART_RATE_SERVICE,
    )
    expect(fixture.service.getCharacteristic).toHaveBeenCalledWith(
      HEART_RATE_MEASUREMENT_CHARACTERISTIC,
    )
    expect(fixture.characteristic.startNotifications).toHaveBeenCalledOnce()
    expect(samples).toHaveBeenCalledWith({
      occurrenceTimeMs: 1_234,
      bpm: 72,
      source: { id: 'web-bluetooth-heart-rate', type: 'bluetooth' },
    })
  })

  it('delivers 16-bit BPM and every RR interval', async () => {
    const fixture = createFixture()
    const samples = vi.fn()
    fixture.source.subscribeSamples(samples)
    await fixture.source.connect()

    fixture.characteristic.notify(
      buildHeartRatePacket({
        bpm: 300,
        useUint16: true,
        rrIntervalsRaw: [512, 1_024],
      }),
    )
    await flushNotification()

    expect(samples).toHaveBeenCalledWith(
      expect.objectContaining({ bpm: 300, rrIntervalsMs: [500, 1_000] }),
    )
  })

  it.each([
    ['chooser-cancelled', new DOMException('cancelled', 'NotFoundError')],
    ['permission-denied', new DOMException('denied', 'NotAllowedError')],
    ['permission-denied', new DOMException('denied', 'SecurityError')],
    ['connection-failed', new Error('chooser failed')],
  ] as const)(
    'maps chooser failures to %s',
    async (expectedCode, chooserError) => {
      const fixture = createFixture()
      vi.mocked(fixture.bluetooth.requestDevice).mockRejectedValueOnce(
        chooserError,
      )

      await fixture.source.connect()

      expect(fixture.source.getStatus()).toEqual(
        expect.objectContaining({
          state: 'error',
          error: expect.objectContaining({ code: expectedCode }),
        }),
      )
    },
  )

  it.each([
    [
      'gatt-unavailable',
      (fixture: ReturnType<typeof createFixture>) => {
        fixture.device.gatt = undefined
      },
    ],
    [
      'gatt-unavailable',
      (fixture: ReturnType<typeof createFixture>) => {
        fixture.device.gatt = null
      },
    ],
    [
      'connection-failed',
      (fixture: ReturnType<typeof createFixture>) => {
        vi.mocked(fixture.gatt.connect).mockRejectedValueOnce(
          new Error('gatt failed'),
        )
      },
    ],
    [
      'service-unavailable',
      (fixture: ReturnType<typeof createFixture>) => {
        vi.mocked(fixture.server.getPrimaryService).mockRejectedValueOnce(
          new Error('missing'),
        )
      },
    ],
    [
      'characteristic-unavailable',
      (fixture: ReturnType<typeof createFixture>) => {
        vi.mocked(fixture.service.getCharacteristic).mockRejectedValueOnce(
          new Error('missing'),
        )
      },
    ],
    [
      'notifications-failed',
      (fixture: ReturnType<typeof createFixture>) => {
        fixture.characteristic.startNotifications.mockRejectedValueOnce(
          new Error('failed'),
        )
      },
    ],
  ] as const)(
    'maps connection-stage failures to %s',
    async (expectedCode, arrange) => {
      const fixture = createFixture()
      arrange(fixture)

      await fixture.source.connect()

      expect(fixture.source.getStatus()).toEqual(
        expect.objectContaining({
          state: 'error',
          error: expect.objectContaining({ code: expectedCode }),
        }),
      )
    },
  )

  it('reports malformed notifications and recovers on the next valid measurement', async () => {
    const fixture = createFixture()
    const samples = vi.fn()
    fixture.source.subscribeSamples(samples)
    await fixture.source.connect()

    fixture.characteristic.notify(new DataView(new Uint8Array([]).buffer))
    await flushNotification()
    expect(fixture.source.getStatus()).toEqual(
      expect.objectContaining({
        state: 'error',
        error: expect.objectContaining({ code: 'malformed-measurement' }),
      }),
    )
    await fixture.source.connect()
    expect(fixture.bluetooth.requestDevice).toHaveBeenCalledOnce()

    fixture.characteristic.notify(buildHeartRatePacket({ bpm: 75 }))
    await flushNotification()
    expect(fixture.source.getStatus()).toEqual({ state: 'connected' })
    expect(samples).toHaveBeenCalledOnce()
  })

  it('maps an unexpected disconnect to a recoverable error and cleans up', async () => {
    const fixture = createFixture()
    await fixture.source.connect()

    fixture.device.disconnectUnexpectedly()
    await flushNotification()

    expect(fixture.source.getStatus()).toEqual(
      expect.objectContaining({
        state: 'error',
        error: expect.objectContaining({ code: 'device-disconnected' }),
      }),
    )
    expect(fixture.characteristic.stopNotifications).toHaveBeenCalledOnce()
    expect(fixture.characteristic.listeners.size).toBe(0)
  })

  it('retries with a fresh generation after a recoverable error', async () => {
    const fixture = createFixture()
    vi.mocked(fixture.bluetooth.requestDevice)
      .mockRejectedValueOnce(new DOMException('cancelled', 'NotFoundError'))
      .mockResolvedValueOnce(fixture.device)

    await fixture.source.connect()
    await fixture.source.connect()

    expect(fixture.source.getStatus()).toEqual({ state: 'connected' })
    expect(fixture.bluetooth.requestDevice).toHaveBeenCalledTimes(2)
  })

  it('coalesces overlapping connects into one chooser operation', async () => {
    const fixture = createFixture()
    let resolveDevice: ((device: BluetoothDevicePort) => void) | undefined
    const deferredDevice = new Promise<BluetoothDevicePort>((resolve) => {
      resolveDevice = resolve
    })
    vi.mocked(fixture.bluetooth.requestDevice).mockReturnValueOnce(
      deferredDevice,
    )

    const firstConnect = fixture.source.connect()
    const secondConnect = fixture.source.connect()
    resolveDevice?.(fixture.device)
    await Promise.all([firstConnect, secondConnect])

    expect(firstConnect).toBe(secondConnect)
    expect(fixture.bluetooth.requestDevice).toHaveBeenCalledOnce()
  })

  it('ignores chooser completion after disposal', async () => {
    const fixture = createFixture()
    let resolveDevice: ((device: BluetoothDevicePort) => void) | undefined
    vi.mocked(fixture.bluetooth.requestDevice).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDevice = resolve
      }),
    )
    const statuses = vi.fn()
    fixture.source.subscribeStatus(statuses)

    const connecting = fixture.source.connect()
    fixture.source.dispose()
    resolveDevice?.(fixture.device)
    await connecting

    expect(fixture.gatt.connect).not.toHaveBeenCalled()
    expect(statuses).toHaveBeenCalledTimes(2)
    expect(fixture.source.getStatus()).toEqual({ state: 'disconnected' })
  })

  it('ignores chooser completion after deliberate cancellation', async () => {
    const fixture = createFixture()
    let resolveDevice: ((device: BluetoothDevicePort) => void) | undefined
    vi.mocked(fixture.bluetooth.requestDevice).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDevice = resolve
      }),
    )

    const connecting = fixture.source.connect()
    await fixture.source.disconnect()
    resolveDevice?.(fixture.device)
    await connecting

    expect(fixture.gatt.connect).not.toHaveBeenCalled()
    expect(fixture.source.getStatus()).toEqual({ state: 'disconnected' })
  })

  it('cleans up a late notification-subscription completion after disconnect', async () => {
    const fixture = createFixture()
    let finishNotifications: (() => void) | undefined
    fixture.characteristic.startNotifications.mockReturnValueOnce(
      new Promise((resolve) => {
        finishNotifications = () => resolve(undefined)
      }),
    )

    const connecting = fixture.source.connect()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await fixture.source.disconnect()
    finishNotifications?.()
    await connecting

    expect(fixture.source.getStatus()).toEqual({ state: 'disconnected' })
    expect(fixture.characteristic.listeners.size).toBe(0)
    expect(fixture.gatt.connected).toBe(false)
  })

  it('ignores notifications after deliberate disconnect', async () => {
    const fixture = createFixture()
    const samples = vi.fn()
    fixture.source.subscribeSamples(samples)
    await fixture.source.connect()
    await fixture.source.disconnect()

    fixture.characteristic.notify(buildHeartRatePacket({ bpm: 80 }))
    await flushNotification()

    expect(samples).not.toHaveBeenCalled()
    expect(fixture.characteristic.listeners.size).toBe(0)
  })

  it('completes teardown when browser cleanup operations fail', async () => {
    const fixture = createFixture()
    await fixture.source.connect()
    fixture.characteristic.stopNotifications.mockRejectedValueOnce(
      new Error('already stopped'),
    )
    vi.mocked(fixture.gatt.disconnect).mockImplementationOnce(() => {
      fixture.gatt.connected = false
      throw new Error('already disconnected')
    })

    await expect(fixture.source.disconnect()).resolves.toBeUndefined()

    expect(fixture.source.getStatus()).toEqual({ state: 'disconnected' })
    expect(fixture.characteristic.listeners.size).toBe(0)
    expect(fixture.device.disconnectListeners.size).toBe(0)
  })

  it('starts a fresh connection while old notification cleanup is pending', async () => {
    const fixture = createFixture()
    await fixture.source.connect()
    let finishNotificationCleanup: (() => void) | undefined
    fixture.characteristic.stopNotifications.mockReturnValueOnce(
      new Promise((resolve) => {
        finishNotificationCleanup = () => resolve(undefined)
      }),
    )

    const disconnecting = fixture.source.disconnect()
    expect(fixture.gatt.connected).toBe(false)
    const reconnecting = fixture.source.connect()

    await reconnecting
    expect(fixture.bluetooth.requestDevice).toHaveBeenCalledTimes(2)
    expect(fixture.source.getStatus()).toEqual({ state: 'connected' })

    finishNotificationCleanup?.()
    await disconnecting
    expect(fixture.source.getStatus()).toEqual({ state: 'connected' })
  })

  it('coalesces a notification burst to the latest measurement', async () => {
    const fixture = createFixture()
    const samples = vi.fn()
    fixture.source.subscribeSamples(samples)
    await fixture.source.connect()

    fixture.characteristic.notify(
      buildHeartRatePacket({ bpm: 70, rrIntervalsRaw: [512] }),
    )
    fixture.characteristic.notify(
      buildHeartRatePacket({ bpm: 71, rrIntervalsRaw: [1_024] }),
    )
    fixture.characteristic.notify(buildHeartRatePacket({ bpm: 72 }))
    await flushNotification()

    expect(samples).toHaveBeenCalledTimes(1)
    expect(samples).toHaveBeenCalledWith(
      expect.objectContaining({ bpm: 72, rrIntervalsMs: [500, 1_000] }),
    )
  })

  it('ignores a disconnect callback from an earlier retry generation', async () => {
    const fixture = createFixture()
    await fixture.source.connect()
    const staleDisconnect = [...fixture.device.disconnectListeners][0]
    fixture.device.disconnectUnexpectedly()
    await flushNotification()
    await fixture.source.connect()

    staleDisconnect?.()

    expect(fixture.source.getStatus()).toEqual({ state: 'connected' })
  })
})
