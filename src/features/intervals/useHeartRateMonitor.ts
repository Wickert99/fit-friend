import { useCallback, useEffect, useRef, useState } from 'react'
import { bluetoothHeartRateSupported, HEART_RATE_MEASUREMENT, HEART_RATE_SERVICE, parseHeartRateMeasurement } from './bluetooth.ts'

export interface HeartRateMonitor {
  supported: boolean
  bpm: number | null
  status: 'idle' | 'connecting' | 'live' | 'error'
  message: string | null
  connect: () => void
  disconnect: () => void
}

interface RateCharacteristic {
  startNotifications: () => Promise<unknown>
  addEventListener: (type: string, listener: (event: Event) => void) => void
  removeEventListener: (type: string, listener: (event: Event) => void) => void
  value?: DataView | null
}

interface RateDevice {
  gatt?: {
    connect: () => Promise<{ getPrimaryService: (service: number) => Promise<{ getCharacteristic: (characteristic: number) => Promise<RateCharacteristic> }> }>
    disconnect: () => void
  } | null
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

interface BluetoothHost {
  bluetooth?: {
    requestDevice?: (options: { filters: { services: number[] }[]; optionalServices: number[] }) => Promise<RateDevice>
  }
}

export function useHeartRateMonitor(): HeartRateMonitor {
  const supported = bluetoothHeartRateSupported()
  const [bpm, setBpm] = useState<number | null>(null)
  const [status, setStatus] = useState<HeartRateMonitor['status']>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const deviceRef = useRef<RateDevice | null>(null)
  const listenRef = useRef<((event: Event) => void) | null>(null)
  const characteristicRef = useRef<RateCharacteristic | null>(null)

  const disconnect = useCallback(() => {
    const characteristic = characteristicRef.current
    const listen = listenRef.current
    if (characteristic && listen) characteristic.removeEventListener('characteristicvaluechanged', listen)
    characteristicRef.current = null
    listenRef.current = null
    const device = deviceRef.current
    deviceRef.current = null
    try {
      device?.gatt?.disconnect()
    } catch {
      /* already closed */
    }
    setBpm(null)
    setStatus('idle')
  }, [])

  useEffect(() => disconnect, [disconnect])

  const connect = useCallback(() => {
    const bluetooth = (navigator as Navigator & BluetoothHost).bluetooth
    if (!bluetooth?.requestDevice) return
    setStatus('connecting')
    setMessage(null)
    void bluetooth
      .requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
        optionalServices: [HEART_RATE_SERVICE],
      })
      .then(async (device) => {
        disconnect()
        deviceRef.current = device
        const server = await device.gatt?.connect()
        if (!server) throw new Error('no server')
        const service = await server.getPrimaryService(HEART_RATE_SERVICE)
        const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT)
        const onValue = (event: Event) => {
          const value = (event.target as { value?: DataView | null } | null)?.value
          if (!value) return
          const next = parseHeartRateMeasurement(value)
          if (next != null) setBpm(next)
        }
        characteristic.addEventListener('characteristicvaluechanged', onValue)
        characteristicRef.current = characteristic
        listenRef.current = onValue
        await characteristic.startNotifications()
        const gone = () => {
          setStatus('idle')
          setBpm(null)
        }
        device.addEventListener('gattserverdisconnected', gone)
        setStatus('live')
      })
      .catch((error: unknown) => {
        const name = error instanceof DOMException ? error.name : ''
        if (name === 'NotFoundError' || name === 'AbortError') {
          setStatus('idle')
          return
        }
        setStatus('error')
        setMessage('Heart rate didn\u2019t connect. The timer still runs.')
      })
  }, [disconnect])

  return { supported, bpm, status, message, connect, disconnect }
}
