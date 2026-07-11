import { describe, expect, it } from 'vitest'

import type { BluetoothPort } from './bluetoothPorts'
import { detectBluetoothCapability } from './bluetoothCapabilities'

const bluetooth = {} as BluetoothPort

describe('detectBluetoothCapability', () => {
  it('reports support only in a secure context with Web Bluetooth', () => {
    expect(
      detectBluetoothCapability({ isSecureContext: true, bluetooth }),
    ).toEqual({
      supported: true,
    })
  })

  it('reports an insecure context before API support', () => {
    expect(
      detectBluetoothCapability({ isSecureContext: false, bluetooth }),
    ).toEqual({
      supported: false,
      reason: 'insecure-context',
    })
  })

  it('reports unsupported when the API is absent', () => {
    expect(detectBluetoothCapability({ isSecureContext: true })).toEqual({
      supported: false,
      reason: 'unsupported',
    })
  })
})
