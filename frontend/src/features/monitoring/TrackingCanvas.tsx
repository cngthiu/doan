import { useEffect, useRef, type RefObject } from 'react'

import { containedVideoRect, mapNormalizedBox } from './geometry'
import { TrackingBuffer } from './trackingBuffer'

interface TrackingCanvasProps {
  videoRef: RefObject<HTMLVideoElement | null>
  buffer: TrackingBuffer
  revision: number
  showConfidence?: boolean
}

export function TrackingCanvas({ videoRef, buffer, revision, showConfidence = false }: TrackingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    let animationId = 0
    let videoFrameId = 0
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
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      const frame = buffer.nearest(video.currentTime * 1000)
      if (!frame) return
      const content = containedVideoRect(width, height, video.videoWidth, video.videoHeight)
      context.lineWidth = 2
      context.strokeStyle = '#22d3ee'
      context.font = '600 13px Inter, sans-serif'
      for (const track of frame.tracks) {
        const [x1, y1, x2, y2] = mapNormalizedBox(track.bbox_norm, content)
        context.strokeRect(x1, y1, x2 - x1, y2 - y1)
        const label = `ID ${String(track.track_id).padStart(2, '0')}${showConfidence ? ` • ${track.confidence.toFixed(2)}` : ''}`
        const labelWidth = context.measureText(label).width + 12
        const labelY = Math.max(0, y1 - 22)
        context.fillStyle = '#0891b2'
        context.fillRect(x1, labelY, labelWidth, 22)
        context.fillStyle = '#ecfeff'
        context.fillText(label, x1 + 6, labelY + 15)
      }
    }

    const schedule = () => {
      if (stopped) return
      if ('requestVideoFrameCallback' in video) {
        videoFrameId = video.requestVideoFrameCallback(() => { draw(); schedule() })
      } else {
        animationId = window.requestAnimationFrame(() => { draw(); schedule() })
      }
    }
    const observer = new ResizeObserver(draw)
    if (canvas.parentElement) observer.observe(canvas.parentElement)
    document.addEventListener('fullscreenchange', draw)
    draw()
    schedule()
    return () => {
      stopped = true
      observer.disconnect()
      document.removeEventListener('fullscreenchange', draw)
      if (animationId) window.cancelAnimationFrame(animationId)
      if (videoFrameId && 'cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(videoFrameId)
    }
  }, [buffer, revision, showConfidence, videoRef])

  return <canvas ref={canvasRef} className="tracking-canvas" aria-hidden="true" />
}
