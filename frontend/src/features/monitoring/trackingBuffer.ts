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
  private runtimeInstanceId: string | null = null
  private runtimeGeneration = -1
  private latestSequence = 0
  private retiredRuntimeInstances = new Set<string>()

  constructor(private readonly maxAgeMs = 3000, private readonly maxItems = 64) {}

  insert(frame: TrackingFrame): { accepted: boolean; reset: boolean } {
    const runtime = this.activateRuntime(frame.runtime_instance_id, frame.runtime_generation)
    if (!runtime.accepted || frame.tracking_seq <= this.latestSequence) {
      return { accepted: false, reset: runtime.reset }
    }
    this.latestSequence = frame.tracking_seq
    this.frames.push(frame)
    this.frames.sort((left, right) => left.timestamp_ms - right.timestamp_ms)
    const newest = this.frames.at(-1)?.timestamp_ms ?? frame.timestamp_ms
    this.frames = this.frames
      .filter((item) => item.timestamp_ms >= newest - this.maxAgeMs)
      .slice(-this.maxItems)
    return { accepted: true, reset: runtime.reset }
  }

  activateRuntime(
    runtimeInstanceId: string,
    runtimeGeneration: number,
  ): { accepted: boolean; reset: boolean } {
    if (this.runtimeInstanceId === runtimeInstanceId) {
      if (runtimeGeneration < this.runtimeGeneration) return { accepted: false, reset: false }
      if (runtimeGeneration === this.runtimeGeneration) return { accepted: true, reset: false }
      this.runtimeGeneration = runtimeGeneration
      this.latestSequence = 0
      this.frames = []
      return { accepted: true, reset: true }
    }
    if (this.retiredRuntimeInstances.has(runtimeInstanceId)) {
      return { accepted: false, reset: false }
    }
    if (this.runtimeInstanceId) this.retiredRuntimeInstances.add(this.runtimeInstanceId)
    this.runtimeInstanceId = runtimeInstanceId
    this.runtimeGeneration = runtimeGeneration
    this.latestSequence = 0
    this.frames = []
    return { accepted: true, reset: true }
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

  clearFrames(): void {
    this.frames = []
  }

  reset(): void {
    this.frames = []
    this.runtimeInstanceId = null
    this.runtimeGeneration = -1
    this.latestSequence = 0
    this.retiredRuntimeInstances.clear()
  }

  get size(): number {
    return this.frames.length
  }

  get sequence(): number {
    return this.latestSequence
  }
}
