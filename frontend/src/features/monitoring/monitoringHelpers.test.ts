import { describe, expect, it } from 'vitest'

import { containedVideoRect, mapNormalizedBox } from './geometry'
import { isTrackingTimestampAligned, TrackingBuffer } from './trackingBuffer'
import type { TrackingFrame } from './types'
import { monitoringSocketUrl, reconnectDelay, shouldReconnect } from './useMonitoringSocket'

function frame(timestamp_ms: number): TrackingFrame {
  return { type: 'tracking', session_id: 'session', timestamp_ms, frame_id: timestamp_ms, source_width: 1920, source_height: 1080, tracks: [] }
}

describe('tracking overlay helpers', () => {
  it('maps boxes through horizontal and vertical letterboxing', () => {
    const horizontal = containedVideoRect(1000, 700, 1920, 1080)
    expect(horizontal).toEqual({ x: 0, y: 68.75, width: 1000, height: 562.5 })
    expect(mapNormalizedBox([0.1, 0.2, 0.5, 0.8], horizontal)).toEqual([100, 181.25, 500, 518.75])
    const vertical = containedVideoRect(1200, 500, 1080, 1920)
    expect(vertical.x).toBeGreaterThan(400)
    expect(vertical.y).toBe(0)
  })

  it('keeps a bounded recent buffer, finds nearest, and clears on seek', () => {
    const buffer = new TrackingBuffer(1000, 3)
    for (const timestamp of [0, 500, 1000, 1500, 2000]) buffer.insert(frame(timestamp))
    expect(buffer.size).toBe(3)
    expect(buffer.nearest(1510)?.timestamp_ms).toBe(1500)
    expect(buffer.nearest(2600)).toBeNull()
    buffer.clear()
    expect(buffer.size).toBe(0)
    expect(isTrackingTimestampAligned(5100, 5000)).toBe(true)
    expect(isTrackingTimestampAligned(1000, 5000)).toBe(false)
  })

  it('builds secure websocket URLs and caps reconnect backoff', () => {
    const location = { protocol: 'https:', host: 'examguard.local' } as Location
    expect(monitoringSocketUrl('abc', location)).toBe('wss://examguard.local/ws/monitoring/abc')
    expect(reconnectDelay(0)).toBe(500)
    expect(reconnectDelay(10)).toBe(5000)
    expect(shouldReconnect(1006)).toBe(true)
    expect(shouldReconnect(4401)).toBe(false)
    expect(shouldReconnect(4409)).toBe(false)
  })
})
