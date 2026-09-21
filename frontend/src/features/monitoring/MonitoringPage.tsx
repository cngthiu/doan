import { useCallback, useEffect, useRef, useState } from 'react'

import { apiErrorMessage } from '../../shared/api/errors'
import { ErrorState } from '../../shared/components/ErrorState'
import { LoadingState } from '../../shared/components/LoadingState'
import { useAuth } from '../auth/AuthProvider'
import { VideoMonitor } from '../media/VideoMonitor'
import { VideoUpload } from '../media/VideoUpload'
import type { MediaAsset } from '../media/types'
import { getSessions, updateSession } from '../sessions/api'
import type { ExamSession } from '../sessions/types'
import {
  getMonitoringStatus,
  pauseMonitoring,
  resumeMonitoring,
  seekMonitoring,
  startMonitoring,
  stopMonitoring,
} from './api'
import { TrackingCanvas } from './TrackingCanvas'
import { isTrackingTimestampAligned, TrackingBuffer } from './trackingBuffer'
import type { MonitoringMessage, MonitoringStatus, RuntimeDiagnostics, RuntimeState, TrackingTrack } from './types'
import { useMonitoringSocket } from './useMonitoringSocket'

const inactiveStatus: MonitoringStatus = {
  session_id: '', state: 'INACTIVE', profile: null, error: null,
  subscriber_count: 0, queue_size: 0, dropped_analysis_frames: 0, diagnostics: null,
}

function metric(value: number | null | undefined, suffix = ''): string {
  return value == null ? '—' : `${value.toFixed(1)}${suffix}`
}

export function MonitoringPage() {
  const { user } = useAuth()
  const canOperate = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR'
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [runtime, setRuntime] = useState<MonitoringStatus>(inactiveStatus)
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null)
  const [activeTracks, setActiveTracks] = useState<TrackingTrack[]>([])
  const [synchronizing, setSynchronizing] = useState(false)
  const [overlayRevision, setOverlayRevision] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackingBuffer = useRef(new TrackingBuffer())
  const synchronizingRef = useRef(false)
  const lastTrackUiUpdate = useRef(0)
  const suppressVideoEvents = useRef(false)
  const selected = sessions.find((item) => item.id === selectedId) ?? null
  const runtimeActive = ['INITIALIZING', 'RUNNING', 'PAUSED'].includes(runtime.state)

  useEffect(() => {
    getSessions().then(setSessions).catch((requestError) => setError(apiErrorMessage(requestError))).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    trackingBuffer.current.clear(); setActiveTracks([]); setDiagnostics(null); setSynchronizing(false); synchronizingRef.current = false
    setOverlayRevision((value) => value + 1)
    if (!selectedId) { setRuntime(inactiveStatus); return }
    getMonitoringStatus(selectedId)
      .then((status) => { setRuntime(status); setDiagnostics(status.diagnostics) })
      .catch((requestError) => setError(apiErrorMessage(requestError)))
  }, [selectedId])

  const handleSocketMessage = useCallback((message: MonitoringMessage) => {
    if (message.type === 'tracking') {
      if (synchronizingRef.current && !isTrackingTimestampAligned(message.timestamp_ms, (videoRef.current?.currentTime ?? 0) * 1000)) return
      trackingBuffer.current.insert(message)
      synchronizingRef.current = false
      setSynchronizing(false)
      const now = performance.now()
      if (now - lastTrackUiUpdate.current >= 250) {
        lastTrackUiUpdate.current = now
        setActiveTracks(message.tracks)
      }
    } else if (message.type === 'diagnostics') {
      setDiagnostics(message)
    } else {
      setRuntime((current) => ({ ...current, state: message.state, error: message.error }))
      synchronizingRef.current = message.synchronizing
      setSynchronizing(message.synchronizing)
      if (message.state === 'ERROR') {
        setError('Không thể khởi tạo hoặc duy trì AI.')
        setErrorDetail(message.error)
      }
    }
  }, [])

  const socketConnected = useMonitoringSocket({ sessionId: selectedId, enabled: runtimeActive, onMessage: handleSocketMessage })

  const attachVideo = async (media: MediaAsset) => {
    const updated = await updateSession(selectedId, { video_asset_id: media.id })
    setSessions((current) => current.map((item) => item.id === updated.id ? updated : item))
  }

  const perform = async (operation: () => Promise<MonitoringStatus>) => {
    setError(null); setErrorDetail(null)
    try {
      const status = await operation()
      setRuntime(status)
      if (status.diagnostics) setDiagnostics(status.diagnostics)
      return status
    } catch (requestError) {
      setError('Không thể thực hiện thao tác giám sát.')
      setErrorDetail(apiErrorMessage(requestError))
      return null
    }
  }

  const start = async () => {
    if (!selected) return
    const video = videoRef.current
    if (!video) return
    const timestampMs = Math.round(video.currentTime * 1000)
    try {
      await video.play()
    } catch {
      setError('Trình duyệt không thể bắt đầu phát video.')
      return
    }
    trackingBuffer.current.clear(); setActiveTracks([]); setSynchronizing(true); synchronizingRef.current = true; setOverlayRevision((value) => value + 1)
    const status = await perform(() => startMonitoring(selected.id, timestampMs))
    if (!status) video.pause()
  }

  const onVideoPause = (video: HTMLVideoElement) => {
    if (!video.ended && !suppressVideoEvents.current && runtime.state === 'RUNNING') {
      void perform(() => pauseMonitoring(selectedId, Math.round(video.currentTime * 1000)))
    }
  }

  const onVideoPlay = (video: HTMLVideoElement) => {
    if (!suppressVideoEvents.current && runtime.state === 'PAUSED') {
      setSynchronizing(true); synchronizingRef.current = true
      void perform(() => resumeMonitoring(selectedId, Math.round(video.currentTime * 1000)))
    }
  }

  const onVideoSeeked = (video: HTMLVideoElement) => {
    if (!runtimeActive) return
    trackingBuffer.current.clear(); setActiveTracks([]); setSynchronizing(true); synchronizingRef.current = true; setOverlayRevision((value) => value + 1)
    void perform(() => seekMonitoring(selectedId, Math.round(video.currentTime * 1000)))
  }

  const onVideoSeeking = () => {
    if (!runtimeActive) return
    trackingBuffer.current.clear(); setActiveTracks([]); setSynchronizing(true); synchronizingRef.current = true; setOverlayRevision((value) => value + 1)
  }

  const stop = async () => {
    suppressVideoEvents.current = true
    videoRef.current?.pause()
    const status = await perform(() => stopMonitoring(selectedId))
    trackingBuffer.current.clear(); setActiveTracks([]); setSynchronizing(false); synchronizingRef.current = false; setOverlayRevision((value) => value + 1)
    if (status) setSessions((items) => items.map((item) => item.id === selectedId ? { ...item, status: 'COMPLETED' } : item))
    window.setTimeout(() => { suppressVideoEvents.current = false }, 0)
  }

  if (loading) return <LoadingState message="Đang tải phiên thi…" />

  const stateLabel: Record<RuntimeState, string> = {
    INACTIVE: 'Chưa chạy', INITIALIZING: 'Đang khởi tạo AI…', RUNNING: 'Đang giám sát',
    PAUSED: 'Đã tạm dừng', COMPLETED: 'Đã hoàn thành', ERROR: 'Lỗi AI',
  }

  return <div className="page-stack monitoring-page">
    <div className="page-heading"><div><p className="eyebrow">GIÁM SÁT</p><h1>Monitoring</h1><p>Phát video gốc mượt mà và theo dõi người theo thời gian thực.</p></div></div>
    {error && <><ErrorState message={error} />{errorDetail && <details className="error-detail"><summary>Chi tiết kỹ thuật</summary><code>{errorDetail}</code></details>}</>}
    <section className="card monitoring-selector"><label htmlFor="monitoring-session">Chọn phiên thi</label><select id="monitoring-session" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setError(null) }}><option value="">Chọn một phiên thi</option>{sessions.map((item) => <option key={item.id} value={item.id}>{item.session_code} — {item.exam_name}</option>)}</select></section>
    {!selected && <section className="card empty-panel"><h2>Chọn một phiên thi</h2><p>Thông tin phòng, thí sinh và video sẽ xuất hiện tại đây.</p></section>}
    {selected && !selected.video && <section className="card"><h2>Phiên thi chưa có video</h2>{canOperate ? <VideoUpload onUploaded={attachVideo} /> : <p className="empty-copy">Bạn chỉ có quyền xem video đã được gắn vào phiên thi.</p>}</section>}
    {selected?.video && <>
      <section className="monitoring-summary"><div className="card"><span>Kỳ thi</span><strong>{selected.exam_name}</strong></div><div className="card"><span>Phòng</span><strong>{selected.room.code}</strong></div><div className="card"><span>Thí sinh</span><strong>{selected.candidate_count}</strong></div><div className="card"><span>Trạng thái</span><strong>{stateLabel[runtime.state]}</strong></div></section>
      <section className="monitoring-live-grid">
        <div className="card monitoring-video-card">
          <div className="media-summary"><strong>{selected.video.original_filename}</strong><span>{selected.video.width}×{selected.video.height} · {selected.video.fps.toFixed(2)} FPS · 1.0×</span></div>
          <VideoMonitor ref={videoRef} mediaUrl={selected.video.media_url} title={selected.video.original_filename} overlay={<><TrackingCanvas videoRef={videoRef} buffer={trackingBuffer.current} revision={overlayRevision} />{synchronizing && <div className="sync-indicator">Đang đồng bộ AI…</div>}</>} onPause={onVideoPause} onPlay={onVideoPlay} onSeeking={onVideoSeeking} onSeeked={onVideoSeeked} onEnded={() => { if (runtimeActive && canOperate) void stop() }} />
          <div className="monitoring-actions">{runtime.state === 'INACTIVE' && canOperate && <button className="primary-button" disabled={selected.status !== 'READY'} type="button" onClick={() => void start()}>Bắt đầu giám sát</button>}{runtime.state === 'INITIALIZING' && <button className="primary-button" disabled type="button">Đang khởi tạo AI…</button>}{runtime.state === 'RUNNING' && canOperate && <button className="secondary-button" type="button" onClick={() => videoRef.current?.pause()}>Tạm dừng</button>}{runtime.state === 'PAUSED' && canOperate && <button className="primary-button" type="button" onClick={() => void videoRef.current?.play()}>Tiếp tục</button>}{runtimeActive && canOperate && <button className="secondary-button" type="button" onClick={() => void stop()}>Kết thúc</button>}{selected.status !== 'READY' && runtime.state === 'INACTIVE' && <span className="secondary-text">Phiên cần ở trạng thái READY trước khi bắt đầu.</span>}</div>
        </div>
        <aside className="card monitoring-side-panel"><p className="panel-label">STATUS</p><div className={`runtime-state ${runtime.state.toLowerCase()}`}><span />{stateLabel[runtime.state]}</div><strong className="person-count">{activeTracks.length} persons</strong><p className="panel-label">TRACKS</p><div className="track-list">{activeTracks.length ? activeTracks.map((track) => <div key={track.track_id}><strong>ID {String(track.track_id).padStart(2, '0')}</strong><span>Active</span></div>) : <p className="secondary-text">Chưa có track đang hoạt động.</p>}</div></aside>
      </section>
      <div className="monitoring-status-bar"><span className={socketConnected && runtime.state === 'RUNNING' ? 'online' : ''}>● {socketConnected ? 'AI Online' : 'AI Offline'}</span><span>Video {selected.video.fps.toFixed(1)} FPS</span><span>AI {metric(diagnostics?.analysis_fps, ' FPS')}</span><span>Latency {metric(diagnostics?.pipeline_ms, ' ms')}</span><span>Lag {metric(diagnostics?.analysis_lag_ms, ' ms')}</span></div>
      <details className="card diagnostics-drawer"><summary>Chẩn đoán runtime</summary><div className="diagnostics-grid"><span>Source FPS <strong>{metric(diagnostics?.source_fps)}</strong></span><span>Analysis FPS <strong>{metric(diagnostics?.analysis_fps)}</strong></span><span>Target FPS <strong>{metric(diagnostics?.target_analysis_fps)}</strong></span><span>Detector <strong>{metric(diagnostics?.detector_ms, ' ms')}</strong></span><span>Tracker <strong>{metric(diagnostics?.tracker_ms, ' ms')}</strong></span><span>Pipeline <strong>{metric(diagnostics?.pipeline_ms, ' ms')}</strong></span><span>Analysis lag <strong>{metric(diagnostics?.analysis_lag_ms, ' ms')}</strong></span><span>GPU <strong>{metric(diagnostics?.gpu_util_pct, '%')}</strong></span><span>VRAM <strong>{metric(diagnostics?.vram_used_mb, ' MB')}</strong></span><span>CPU <strong>{metric(diagnostics?.cpu_util_pct, '%')}</strong></span><span>RAM <strong>{metric(diagnostics?.ram_used_mb, ' MB')}</strong></span><span>Dropped <strong>{diagnostics?.dropped_analysis_frames ?? '—'}</strong></span><span>Queue <strong>{diagnostics?.queue_size ?? '—'}</strong></span><span>Profile <strong>{diagnostics?.profile ?? runtime.profile ?? '—'}</strong></span></div></details>
    </>}
  </div>
}
