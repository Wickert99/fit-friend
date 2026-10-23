/** Heart Rate Service. https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/ */
export const HEART_RATE_SERVICE = 0x180d
/** Heart Rate Measurement characteristic. */
export const HEART_RATE_MEASUREMENT = 0x2a37

export function bluetoothHeartRateSupported(host?: { bluetooth?: { requestDevice?: unknown } } | null): boolean {
  const target = host === undefined && typeof navigator !== 'undefined' ? navigator : host
  const bluetooth = (target as { bluetooth?: { requestDevice?: unknown } } | null | undefined)?.bluetooth
  return typeof bluetooth?.requestDevice === 'function'
}

/**
 * Flags bit 0 selects the BPM width: 0 = uint8, 1 = uint16 little-endian.
 * Other flag bits (sensor contact, energy expended, RR intervals) are ignored.
 */
export function parseHeartRateMeasurement(data: DataView): number | null {
  if (data.byteLength < 2) return null
  const flags = data.getUint8(0)
  const wide = (flags & 0x01) === 0x01
  if (wide && data.byteLength < 3) return null
  const bpm = wide ? data.getUint16(1, true) : data.getUint8(1)
  if (!Number.isFinite(bpm) || bpm < 1 || bpm > 260) return null
  return bpm
}
