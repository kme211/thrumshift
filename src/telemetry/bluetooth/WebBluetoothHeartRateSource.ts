import type {
  HeartRateSample,
  HeartRateSourceIdentity,
} from '../../domain/heart-rate/types'
import type { MonotonicClock } from '../../platform/Clock'
import type {
  HeartRateTelemetrySource,
  TelemetryCapability,
  TelemetrySourceError,
  TelemetrySourceStatus,
  Unsubscribe,
} from '../HeartRateTelemetrySource'
import { detectBluetoothCapability } from './bluetoothCapabilities'
import {
  HEART_RATE_MEASUREMENT_CHARACTERISTIC,
  HEART_RATE_SERVICE,
  type BluetoothCharacteristicPort,
  type BluetoothDevicePort,
  type BluetoothEnvironment,
} from './bluetoothPorts'
import {
  parseHeartRateMeasurement,
  type ParsedHeartRateMeasurement,
} from './parseHeartRateMeasurement'

const IDENTITY: HeartRateSourceIdentity = {
  id: 'web-bluetooth-heart-rate',
  type: 'bluetooth',
}

interface ConnectionResources {
  readonly device: BluetoothDevicePort
  readonly characteristic: BluetoothCharacteristicPort
  readonly disconnectListener: () => void
  readonly notificationListener: () => void
}

function error(
  code: TelemetrySourceError['code'],
  message: string,
): TelemetrySourceError {
  return { code, message }
}

function errorName(value: unknown): string | undefined {
  return value instanceof DOMException ? value.name : undefined
}

export class WebBluetoothHeartRateSource implements HeartRateTelemetrySource {
  readonly identity = IDENTITY
  readonly capability: TelemetryCapability

  private status: TelemetrySourceStatus = { state: 'disconnected' }
  private readonly statusListeners = new Set<
    (status: TelemetrySourceStatus) => void
  >()
  private readonly sampleListeners = new Set<
    (sample: HeartRateSample) => void
  >()
  private resources: ConnectionResources | null = null
  private generation = 0
  private connectOperation: Promise<void> | null = null
  private disposed = false
  private pendingMeasurement: ParsedHeartRateMeasurement | null = null
  private pendingMalformedMeasurement = false
  private notificationScheduled = false

  constructor(
    private readonly environment: BluetoothEnvironment,
    private readonly clock: MonotonicClock,
  ) {
    this.capability = detectBluetoothCapability(environment)
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

  connect(): Promise<void> {
    if (
      this.disposed ||
      this.resources !== null ||
      this.status.state === 'connected'
    ) {
      return Promise.resolve()
    }
    if (this.connectOperation !== null) {
      return this.connectOperation
    }
    if (!this.capability.supported) {
      const sourceError =
        this.capability.reason === 'insecure-context'
          ? error(
              'insecure-context',
              'Web Bluetooth requires HTTPS or localhost',
            )
          : error(
              'unsupported',
              'Web Bluetooth is not available in this browser',
            )
      this.publishStatus({ state: 'error', error: sourceError })
      return Promise.resolve()
    }

    const generation = ++this.generation
    this.publishStatus({ state: 'connecting' })
    const operation = this.performConnect(generation)
    this.connectOperation = operation
    void operation.finally(() => {
      if (this.connectOperation === operation) {
        this.connectOperation = null
      }
    })
    return operation
  }

  async disconnect(): Promise<void> {
    if (this.disposed) {
      return
    }
    ++this.generation
    this.pendingMeasurement = null
    this.pendingMalformedMeasurement = false
    const resources = this.resources
    this.resources = null
    const cleanup = this.teardownResources(resources)
    if (this.status.state !== 'disconnected') {
      this.publishStatus({ state: 'disconnected' })
    }
    await cleanup
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    ++this.generation
    this.pendingMeasurement = null
    this.pendingMalformedMeasurement = false
    const resources = this.resources
    this.resources = null
    void this.teardownResources(resources)
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

  private async performConnect(generation: number): Promise<void> {
    let device: BluetoothDevicePort | null = null
    let characteristic: BluetoothCharacteristicPort | null = null
    let disconnectListener: (() => void) | null = null
    let notificationListener: (() => void) | null = null

    try {
      try {
        device = await this.environment.bluetooth!.requestDevice({
          filters: [{ services: [HEART_RATE_SERVICE] }],
        })
      } catch (cause) {
        if (this.isCurrent(generation)) {
          const name = errorName(cause)
          const sourceError =
            name === 'NotFoundError'
              ? error('chooser-cancelled', 'No heart-rate monitor was selected')
              : name === 'NotAllowedError' || name === 'SecurityError'
                ? error('permission-denied', 'Bluetooth permission was denied')
                : error(
                    'connection-failed',
                    'Unable to open the Bluetooth device chooser',
                  )
          this.publishStatus({ state: 'error', error: sourceError })
        }
        return
      }

      if (!this.isCurrent(generation)) {
        return
      }
      if (device.gatt === undefined || device.gatt === null) {
        this.publishStatus({
          state: 'error',
          error: error(
            'gatt-unavailable',
            'The selected device does not expose GATT',
          ),
        })
        return
      }

      disconnectListener = () => this.handleUnexpectedDisconnect(generation)
      device.addEventListener('gattserverdisconnected', disconnectListener)

      let server
      try {
        server = await device.gatt.connect()
      } catch {
        if (this.isCurrent(generation)) {
          this.publishStatus({
            state: 'error',
            error: error(
              'connection-failed',
              'Could not connect to the heart-rate monitor',
            ),
          })
        }
        return
      }
      if (!this.isCurrent(generation)) {
        return
      }

      let service
      try {
        service = await server.getPrimaryService(HEART_RATE_SERVICE)
      } catch {
        if (this.isCurrent(generation)) {
          this.publishStatus({
            state: 'error',
            error: error(
              'service-unavailable',
              'Heart Rate Service was not found',
            ),
          })
        }
        return
      }
      if (!this.isCurrent(generation)) {
        return
      }

      try {
        characteristic = await service.getCharacteristic(
          HEART_RATE_MEASUREMENT_CHARACTERISTIC,
        )
      } catch {
        if (this.isCurrent(generation)) {
          this.publishStatus({
            state: 'error',
            error: error(
              'characteristic-unavailable',
              'Heart Rate Measurement characteristic was not found',
            ),
          })
        }
        return
      }
      if (!this.isCurrent(generation)) {
        return
      }

      const connectedCharacteristic = characteristic
      notificationListener = () =>
        this.queueMeasurement(connectedCharacteristic, generation)
      connectedCharacteristic.addEventListener(
        'characteristicvaluechanged',
        notificationListener,
      )
      try {
        await connectedCharacteristic.startNotifications()
      } catch {
        if (this.isCurrent(generation)) {
          this.publishStatus({
            state: 'error',
            error: error(
              'notifications-failed',
              'Could not subscribe to heart-rate measurements',
            ),
          })
        }
        return
      }
      if (!this.isCurrent(generation)) {
        return
      }

      this.resources = {
        device,
        characteristic: connectedCharacteristic,
        disconnectListener,
        notificationListener,
      }
      this.publishStatus({ state: 'connected' })
      device = null
      characteristic = null
      disconnectListener = null
      notificationListener = null
    } finally {
      if (device !== null) {
        if (
          characteristic !== null &&
          disconnectListener !== null &&
          notificationListener !== null
        ) {
          await this.teardownResources({
            device,
            characteristic,
            disconnectListener,
            notificationListener,
          })
        } else {
          if (disconnectListener !== null) {
            device.removeEventListener(
              'gattserverdisconnected',
              disconnectListener,
            )
          }
          this.disconnectDevice(device)
        }
      }
    }
  }

  private queueMeasurement(
    characteristic: BluetoothCharacteristicPort,
    generation: number,
  ): void {
    if (!this.isCurrent(generation) || characteristic.value === null) {
      return
    }
    const parsed = parseHeartRateMeasurement(characteristic.value)
    if (!parsed.ok) {
      this.pendingMalformedMeasurement = true
    } else {
      const existingRrIntervals = this.pendingMeasurement?.rrIntervalsMs ?? []
      const nextRrIntervals = parsed.value.rrIntervalsMs ?? []
      const rrIntervalsMs = [...existingRrIntervals, ...nextRrIntervals]
      this.pendingMeasurement = {
        bpm: parsed.value.bpm,
        ...(rrIntervalsMs.length === 0 ? {} : { rrIntervalsMs }),
      }
    }
    if (this.notificationScheduled) {
      return
    }
    this.notificationScheduled = true
    queueMicrotask(() => {
      this.notificationScheduled = false
      const measurement = this.pendingMeasurement
      const malformedMeasurement = this.pendingMalformedMeasurement
      this.pendingMeasurement = null
      this.pendingMalformedMeasurement = false
      if (!this.isCurrent(generation)) {
        return
      }
      if (malformedMeasurement) {
        this.publishStatus({
          state: 'error',
          error: error(
            'malformed-measurement',
            'The monitor sent a malformed measurement',
          ),
        })
      }
      if (measurement !== null) {
        this.publishMeasurement(measurement)
      }
    })
  }

  private publishMeasurement(measurement: ParsedHeartRateMeasurement): void {
    if (this.status.state === 'error') {
      this.publishStatus({ state: 'connected' })
    }
    const sample: HeartRateSample = {
      occurrenceTimeMs: this.clock.now(),
      bpm: measurement.bpm,
      source: this.identity,
      ...(measurement.rrIntervalsMs === undefined
        ? {}
        : { rrIntervalsMs: measurement.rrIntervalsMs }),
    }
    for (const listener of this.sampleListeners) {
      listener(sample)
    }
  }

  private handleUnexpectedDisconnect(generation: number): void {
    if (!this.isCurrent(generation)) {
      return
    }
    ++this.generation
    this.pendingMeasurement = null
    this.pendingMalformedMeasurement = false
    const resources = this.resources
    this.resources = null
    void this.teardownResources(resources)
    this.publishStatus({
      state: 'error',
      error: error(
        'device-disconnected',
        'The heart-rate monitor disconnected',
      ),
    })
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation
  }

  private async teardownResources(
    resources: ConnectionResources | null,
  ): Promise<void> {
    if (resources === null) {
      return
    }
    resources.device.removeEventListener(
      'gattserverdisconnected',
      resources.disconnectListener,
    )
    resources.characteristic.removeEventListener(
      'characteristicvaluechanged',
      resources.notificationListener,
    )
    let notificationCleanup: Promise<void> | null = null
    try {
      notificationCleanup = resources.characteristic.stopNotifications()
    } catch {
      // Continue with synchronous GATT teardown.
    }
    this.disconnectDevice(resources.device)
    if (notificationCleanup !== null) {
      try {
        await notificationCleanup
      } catch {
        // Listener and GATT ownership were already released synchronously.
      }
    }
  }

  private disconnectDevice(device: BluetoothDevicePort): void {
    if (device.gatt?.connected) {
      try {
        device.gatt.disconnect()
      } catch {
        // Device teardown remains best-effort after listener removal.
      }
    }
  }
}
