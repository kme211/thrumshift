export const HEART_RATE_SERVICE = 'heart_rate'
export const HEART_RATE_MEASUREMENT_CHARACTERISTIC = 'heart_rate_measurement'

export interface BluetoothRequestDeviceOptions {
  readonly filters: readonly [
    { readonly services: readonly [typeof HEART_RATE_SERVICE] },
  ]
}

export type BluetoothEventListener = () => void

export interface BluetoothCharacteristicPort {
  readonly value: DataView | null
  startNotifications(): Promise<void>
  stopNotifications(): Promise<void>
  addEventListener(
    type: 'characteristicvaluechanged',
    listener: BluetoothEventListener,
  ): void
  removeEventListener(
    type: 'characteristicvaluechanged',
    listener: BluetoothEventListener,
  ): void
}

export interface BluetoothServicePort {
  getCharacteristic(
    characteristic: typeof HEART_RATE_MEASUREMENT_CHARACTERISTIC,
  ): Promise<BluetoothCharacteristicPort>
}

export interface BluetoothServerPort {
  getPrimaryService(
    service: typeof HEART_RATE_SERVICE,
  ): Promise<BluetoothServicePort>
}

export interface BluetoothGattPort {
  readonly connected: boolean
  connect(): Promise<BluetoothServerPort>
  disconnect(): void
}

export interface BluetoothDevicePort {
  readonly gatt: BluetoothGattPort | null | undefined
  addEventListener(
    type: 'gattserverdisconnected',
    listener: BluetoothEventListener,
  ): void
  removeEventListener(
    type: 'gattserverdisconnected',
    listener: BluetoothEventListener,
  ): void
}

export interface BluetoothPort {
  requestDevice(
    options: BluetoothRequestDeviceOptions,
  ): Promise<BluetoothDevicePort>
}

export interface BluetoothEnvironment {
  readonly isSecureContext: boolean
  readonly bluetooth?: BluetoothPort
}

interface NavigatorWithBluetooth extends Navigator {
  readonly bluetooth?: BluetoothPort
}

export function getBrowserBluetoothEnvironment(): BluetoothEnvironment {
  const browserNavigator = navigator as NavigatorWithBluetooth
  return {
    isSecureContext: Boolean(globalThis.isSecureContext),
    ...(browserNavigator.bluetooth === undefined
      ? {}
      : { bluetooth: browserNavigator.bluetooth }),
  }
}
