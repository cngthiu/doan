import type { TrackingFrame } from './types'

export function isTrackingTimestampAligned(
  frameTimestampMs: number,
  videoTimestampMs: number,
  toleranceMs = 250,
): boolean {
  return Math.abs(frameTimestampMs - videoTimestampMs) <= toleranceMs
}

export class TrackingBuffer {
  private frames: TrackingFrame[] = []

  constructor(private readonly maxAgeMs = 3000, private readonly maxItems = 64) {}

  insert(frame: TrackingFrame): void {
    this.frames.push(frame)
    this.frames.sort((left, right) => left.timestamp_ms - right.timestamp_ms)
    const newest = this.frames.at(-1)?.timestamp_ms ?? frame.timestamp_ms
    this.frames = this.frames
      .filter((item) => item.timestamp_ms >= newest - this.maxAgeMs)
      .slice(-this.maxItems)
  }

  nearest(timestampMs: number, toleranceMs = 250): TrackingFrame | null {
    let nearest: TrackingFrame | null = null
    let distance = Number.POSITIVE_INFINITY
    for (const frame of this.frames) {
      const currentDistance = Math.abs(frame.timestamp_ms - timestampMs)
      if (currentDistance < distance) {
        nearest = frame
        distance = currentDistance
      }
    }
    return distance <= toleranceMs ? nearest : null
  }

  clear(): void {
    this.frames = []
  }

  get size(): number {
    return this.frames.length
  }
}
