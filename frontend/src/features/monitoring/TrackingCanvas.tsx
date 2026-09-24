import { useEffect, useRef, type RefObject } from 'react'

import { containedVideoRect, mapNormalizedBox } from './geometry'
import { TrackingBuffer } from './trackingBuffer'
import type { TrackingTrack } from './types'

interface TrackingCanvasProps {
  videoRef: RefObject<HTMLVideoElement | null>
  buffer: TrackingBuffer
  revision: number
  showConfidence?: boolean
  candidateCodes: ReadonlyMap<string, string>
  debug?: boolean
}

export function trackingLabel(
  track: TrackingTrack,
  candidateCodes: ReadonlyMap<string, string>,
  debug = false,
): string[] {
  const labels: string[] = []
  const candidateCode = track.identity.session_candidate_id
    ? candidateCodes.get(track.identity.session_candidate_id)
    : undefined
  labels.push(
    candidateCode && track.identity.seat_code
      ? `${track.identity.seat_code} • ${candidateCode}`
      : track.actor_id,
  )
  if (debug) {
    labels.push(
      `${track.actor_id} • T${track.track_id}${track.recovered ? ' • recovered' : ''}${track.identity.score == null ? '' : ` • seat=${track.identity.score.toFixed(2)}`}`,
    )
  }
  return labels
}

interface ClearableCanvasContext {
  clearRect(x: number, y: number, width: number, height: number): void
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
}

export function clearCanvasBackingStore(
  context: ClearableCanvasContext,
  canvas: Pick<HTMLCanvasElement, 'width' | 'height'>,
): void {
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, canvas.width, canvas.height)
}

interface VideoFrameScheduler {
  requestVideoFrameCallback(callback: () => void): number
  cancelVideoFrameCallback?(callbackId: number): void
}

export function startTrackingRenderLoop(
  video: VideoFrameScheduler,
  draw: () => void,
): () => void {
  let callbackId = 0
  let stopped = false
  const schedule = () => {
    if (stopped) return
    callbackId = video.requestVideoFrameCallback(() => {
      if (stopped) return
      draw()
      schedule()
    })
  }
  schedule()
  return () => {
    stopped = true
    if (callbackId) video.cancelVideoFrameCallback?.(callbackId)
  }
}

export function TrackingCanvas({ videoRef, buffer, revision, showConfidence = false, candidateCodes, debug = false }: TrackingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    let animationId = 0
    let stopped = false

    const draw = () => {
      const context = canvas.getContext('2d')
      if (!context) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const ratio = window.devicePixelRatio || 1
      const targetWidth = Math.round(width * ratio)
      const targetHeight = Math.round(height * ratio)
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth
        canvas.height = targetHeight
      }
      clearCanvasBackingStore(context, canvas)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      const frame = buffer.nearest(video.currentTime * 1000)
      if (!frame) return
      const content = containedVideoRect(width, height, video.videoWidth, video.videoHeight)
      context.lineWidth = 2
      context.strokeStyle = '#22d3ee'
      context.font = '600 13px Inter, sans-serif'
      for (const track of frame.tracks) {
        const [x1, y1, x2, y2] = mapNormalizedBox(track.bbox_norm, content)
        context.strokeRect(x1, y1, x2 - x1, y2 - y1)
        const labels = trackingLabel(track, candidateCodes, debug)
        if (showConfidence && labels.length) labels[labels.length - 1] += ` • conf=${track.confidence.toFixed(2)}`
        labels.forEach((label, index) => {
          const labelWidth = context.measureText(label).width + 12
          const labelY = Math.max(0, y1 - (labels.length - index) * 22)
          context.fillStyle = index === 0 ? '#0891b2' : '#334155'
          context.fillRect(x1, labelY, labelWidth, 22)
          context.fillStyle = '#ecfeff'
          context.fillText(label, x1 + 6, labelY + 15)
        })
      }
    }

    const cancelVideoLoop = 'requestVideoFrameCallback' in video
      ? startTrackingRenderLoop(video, draw)
      : null
    const scheduleAnimation = () => {
      if (stopped || cancelVideoLoop) return
      animationId = window.requestAnimationFrame(() => { draw(); scheduleAnimation() })
    }
    const observer = new ResizeObserver(draw)
    if (canvas.parentElement) observer.observe(canvas.parentElement)
    document.addEventListener('fullscreenchange', draw)
    draw()
    scheduleAnimation()
    return () => {
      stopped = true
      observer.disconnect()
      document.removeEventListener('fullscreenchange', draw)
      if (animationId) window.cancelAnimationFrame(animationId)
      cancelVideoLoop?.()
      const context = canvas.getContext('2d')
      if (context) clearCanvasBackingStore(context, canvas)
    }
  }, [buffer, candidateCodes, debug, showConfidence, videoRef])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) clearCanvasBackingStore(context, canvas)
  }, [revision])

  return <canvas ref={canvasRef} className="tracking-canvas" aria-hidden="true" />
}
