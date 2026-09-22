import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiContentErrorMessage, apiErrorMessage } from '../../shared/api/errors'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { EmptyState } from '../../shared/components/EmptyState'
import { ErrorState } from '../../shared/components/ErrorState'
import { LoadingState } from '../../shared/components/LoadingState'
import { PageHeader } from '../../shared/components/PageHeader'
import { useToast } from '../../shared/components/ToastProvider'
import { formatFps, formatResolution } from '../../shared/formatters'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue'
import { runtimeStateLabels, sessionStatusLabels } from '../../shared/i18n/vi'
import { PermissionGate } from '../auth/PermissionGate'
import { permissions, usePermissions } from '../auth/permissions'
import { VideoMonitor } from '../media/VideoMonitor'
import { VideoUpload } from '../media/VideoUpload'
import type { MediaAsset } from '../media/types'
import { getSessions, updateSession } from '../sessions/api'
import { SessionReadinessPanel } from '../sessions/SessionReadinessPanel'
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
import type { MonitoringMessage, MonitoringStatus, RuntimeDiagnostics, TrackingTrack } from './types'
import { useMonitoringSocket } from './useMonitoringSocket'

const inactiveStatus: MonitoringStatus = {
  session_id: '', state: 'INACTIVE', profile: null, error: null,
  subscriber_count: 0, queue_size: 0, dropped_analysis_frames: 0, diagnostics: null,
  runtime_instance_id: null, runtime_generation: null, worker_instance_id: null,
  tracker_instance_id: null, tracking_seq: 0,
}

function metric(value: number | null | undefined, suffix = ''): string {
  return value == null ? '—' : `${value.toFixed(1)}${suffix}`
}

export function MonitoringPage() {
  const { can } = usePermissions()
  const toast = useToast()
  const canOperate = can(permissions.sessionMonitor)
  const canManageSession = can(permissions.sessionManage)
  const canUpload = can(permissions.mediaUpload) && canManageSession
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [sessionQuery, setSessionQuery] = useState('')
  const debouncedSessionQuery = useDebouncedValue(sessionQuery)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [runtime, setRuntime] = useState<MonitoringStatus>(inactiveStatus)
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null)
  const [activeTracks, setActiveTracks] = useState<TrackingTrack[]>([])
  const [synchronizing, setSynchronizing] = useState(false)
  const [overlayRevision, setOverlayRevision] = useState(0)
  const [confirmStop, setConfirmStop] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackingBuffer = useRef(new TrackingBuffer())
  const synchronizingRef = useRef(false)
  const lastTrackUiUpdate = useRef(0)
  const suppressVideoEvents = useRef(false)
  const selected = sessions.find((item) => item.id === selectedId) ?? null
  const runtimeActive = ['INITIALIZING', 'RUNNING', 'PAUSED'].includes(runtime.state)

  const loadSessions = useCallback((search: string) => {
    setLoading(true)
    getSessions({ query: search, pageSize: 20 })
      .then((result) => setSessions(result.items))
      .catch((requestError) => setError(apiContentErrorMessage(requestError)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadSessions(debouncedSessionQuery) }, [debouncedSessionQuery, loadSessions])

  useEffect(() => {
    trackingBuffer.current.reset(); setActiveTracks([]); setDiagnostics(null); setSynchronizing(false); synchronizingRef.current = false
    setOverlayRevision((value) => value + 1)
    if (!selectedId) { setRuntime(inactiveStatus); return }
    getMonitoringStatus(selectedId)
      .then((status) => {
        setRuntime(status); setDiagnostics(status.diagnostics)
        if (status.runtime_instance_id && status.runtime_generation != null) {
          trackingBuffer.current.activateRuntime(status.runtime_instance_id, status.runtime_generation)
        }
      })
      .catch((requestError) => setError(apiContentErrorMessage(requestError)))
  }, [selectedId])

  const handleSocketMessage = useCallback((message: MonitoringMessage) => {
    if (message.type === 'tracking') {
      if (synchronizingRef.current && !isTrackingTimestampAligned(message.timestamp_ms, (videoRef.current?.currentTime ?? 0) * 1000)) return
      const inserted = trackingBuffer.current.insert(message)
      if (!inserted.accepted) return
      if (inserted.reset) {
        setActiveTracks([])
        setOverlayRevision((value) => value + 1)
      }
      synchronizingRef.current = false
      setSynchronizing(false)
      const now = performance.now()
      if (now - lastTrackUiUpdate.current >= 250) {
        lastTrackUiUpdate.current = now
        setActiveTracks(message.tracks)
      }
    } else if (message.type === 'diagnostics') {
      const active = trackingBuffer.current.activateRuntime(message.runtime_instance_id, message.runtime_generation)
      if (!active.accepted) return
      if (active.reset) { setActiveTracks([]); setOverlayRevision((value) => value + 1) }
      setDiagnostics(message)
    } else {
      const active = trackingBuffer.current.activateRuntime(message.runtime_instance_id, message.runtime_generation)
      if (!active.accepted) return
      if (active.reset) { setActiveTracks([]); setOverlayRevision((value) => value + 1) }
      setRuntime((current) => ({ ...current, state: message.state, error: message.error }))
      synchronizingRef.current = message.synchronizing
      setSynchronizing(message.synchronizing)
      if (message.state === 'ERROR') {
        trackingBuffer.current.clearFrames()
        synchronizingRef.current = false
        setSynchronizing(false)
        setActiveTracks([])
        setOverlayRevision((value) => value + 1)
        setError('Không thể khởi tạo hoặc duy trì AI.')
        setErrorDetail(message.error)
      }
    }
  }, [])

  useEffect(() => () => {
    trackingBuffer.current.reset()
    const canvas = videoRef.current?.parentElement?.querySelector('canvas')
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const socketConnected = useMonitoringSocket({ sessionId: selectedId, enabled: runtimeActive, onMessage: handleSocketMessage })

  const attachVideo = async (media: MediaAsset) => {
    const updated = await updateSession(selectedId, { video_asset_id: media.id })
    setSessions((current) => current.map((item) => item.id === updated.id ? updated : item))
    toast.success('Đã gắn video nguồn vào phiên thi.')
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
    trackingBuffer.current.reset(); setActiveTracks([]); setSynchronizing(true); synchronizingRef.current = true; setOverlayRevision((value) => value + 1)
    const status = await perform(() => startMonitoring(selected.id, timestampMs))
    if (!status) {
      video.pause()
      trackingBuffer.current.clearFrames()
      synchronizingRef.current = false
      setSynchronizing(false)
      setActiveTracks([])
      setOverlayRevision((value) => value + 1)
    }
  }

  const onVideoPause = (video: HTMLVideoElement) => {
    if (canOperate && !video.ended && !suppressVideoEvents.current && runtime.state === 'RUNNING') {
      void perform(() => pauseMonitoring(selectedId, Math.round(video.currentTime * 1000)))
    }
  }

  const onVideoPlay = (video: HTMLVideoElement) => {
    if (canOperate && !suppressVideoEvents.current && runtime.state === 'PAUSED') {
      void perform(() => resumeMonitoring(selectedId))
    }
  }

  const onVideoSeeked = (video: HTMLVideoElement) => {
    if (!runtimeActive || !canOperate) return
    trackingBuffer.current.clearFrames(); setActiveTracks([]); setSynchronizing(true); synchronizingRef.current = true; setOverlayRevision((value) => value + 1)
    void perform(() => seekMonitoring(selectedId, Math.round(video.currentTime * 1000)))
  }

  const onVideoSeeking = () => {
    if (!runtimeActive || !canOperate) return
    trackingBuffer.current.clearFrames(); setActiveTracks([]); setSynchronizing(true); synchronizingRef.current = true; setOverlayRevision((value) => value + 1)
  }

  const stop = async () => {
    suppressVideoEvents.current = true
    videoRef.current?.pause()
    const status = await perform(() => stopMonitoring(selectedId))
    trackingBuffer.current.reset(); setActiveTracks([]); setSynchronizing(false); synchronizingRef.current = false; setOverlayRevision((value) => value + 1)
    if (status) setSessions((items) => items.map((item) => item.id === selectedId ? { ...item, status: 'COMPLETED' } : item))
    window.setTimeout(() => { suppressVideoEvents.current = false }, 0)
  }

  if (loading && sessions.length === 0) return <LoadingState message="Đang tải phiên thi…" />

  return <div className="page-stack monitoring-page">
    <PageHeader eyebrow="GIÁM SÁT" title="Giám sát" description="Phát video nguồn và theo dõi người theo thời gian thực." />
    {error && <><ErrorState message={error} onRetry={() => loadSessions(debouncedSessionQuery)} />{errorDetail && can(permissions.diagnosticsRead) && <details className="error-detail"><summary>Chi tiết kỹ thuật</summary><code>{errorDetail}</code></details>}</>}
    <section className="card monitoring-selector"><label htmlFor="monitoring-session-search">Tìm phiên thi</label><input id="monitoring-session-search" placeholder="Nhập mã hoặc tên kỳ thi…" value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} /><label htmlFor="monitoring-session">Phiên thi</label><select id="monitoring-session" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setError(null) }}><option value="">Chọn một phiên thi</option>{sessions.map((item) => <option key={item.id} value={item.id}>{item.session_code} — {item.exam_name} · {sessionStatusLabels[item.status]}</option>)}</select></section>
    {!selected && <section className="card empty-panel"><EmptyState title="Chọn một phiên thi" description="Thông tin phòng thi, thí sinh và video sẽ xuất hiện tại đây." /></section>}
    {selected && <SessionReadinessPanel session={selected} actions={<Link className="secondary-button link-button" to={`/sessions/${selected.id}`}>{canManageSession ? 'Hoàn thiện thiết lập' : 'Xem chi tiết phiên thi'}</Link>} />}
    {selected && !selected.video && <section className="card"><h2>Phiên thi chưa có video</h2>{canUpload ? <VideoUpload onUploaded={attachVideo} /> : <p className="empty-copy">Bạn chỉ có quyền xem video đã được gắn vào phiên thi.</p>}</section>}
    {selected?.video && <>
      <section className="monitoring-summary"><div className="card"><span>Kỳ thi</span><strong>{selected.exam_name}</strong></div><div className="card"><span>Phòng thi</span><strong>{selected.room.code}</strong></div><div className="card"><span>Thí sinh</span><strong>{selected.candidate_count}</strong></div><div className="card"><span>Trạng thái</span><strong>{runtimeStateLabels[runtime.state]}</strong></div></section>
      <section className="monitoring-live-grid">
        <div className="card monitoring-video-card">
          <div className="media-summary"><strong>{selected.video.original_filename}</strong><span>{formatResolution(selected.video.width, selected.video.height)} · {formatFps(selected.video.fps, 2)} · 1.0×</span></div>
          <VideoMonitor ref={videoRef} mediaUrl={selected.video.media_url} title={selected.video.original_filename} overlay={<><TrackingCanvas videoRef={videoRef} buffer={trackingBuffer.current} revision={overlayRevision} />{synchronizing && <div className="sync-indicator">Đang đồng bộ AI…</div>}</>} onPause={onVideoPause} onPlay={onVideoPlay} onSeeking={onVideoSeeking} onSeeked={onVideoSeeked} onEnded={() => { if (runtimeActive && canOperate) void stop() }} />
          <div className="monitoring-actions">{runtime.state === 'INACTIVE' && canOperate && <button className="primary-button" disabled={selected.status !== 'READY'} type="button" onClick={() => void start()}>Bắt đầu giám sát</button>}{runtime.state === 'INITIALIZING' && <button className="primary-button" disabled type="button">Đang khởi tạo AI…</button>}{runtime.state === 'RUNNING' && canOperate && <button className="secondary-button" type="button" onClick={() => videoRef.current?.pause()}>Tạm dừng</button>}{runtime.state === 'PAUSED' && canOperate && <button className="primary-button" type="button" onClick={() => void videoRef.current?.play()}>Tiếp tục</button>}{runtimeActive && canOperate && <button className="danger-button subtle" type="button" onClick={() => setConfirmStop(true)}>Kết thúc</button>}{selected.status !== 'READY' && runtime.state === 'INACTIVE' && <span className="secondary-text">Phiên thi cần ở trạng thái Sẵn sàng trước khi bắt đầu.</span>}</div>
        </div>
        <aside className="card monitoring-side-panel"><p className="panel-label">TRẠNG THÁI</p><div className={`runtime-state ${runtime.state.toLowerCase()}`}><span />{runtimeStateLabels[runtime.state]}</div><strong className="person-count">{activeTracks.length} người</strong><p className="panel-label">ĐỐI TƯỢNG THEO DÕI</p><div className="track-list">{activeTracks.length ? activeTracks.map((track) => <div key={track.track_id}><strong>ID {String(track.track_id).padStart(2, '0')}</strong><span>Đang theo dõi</span></div>) : <p className="secondary-text">Chưa phát hiện người đang theo dõi.</p>}</div></aside>
      </section>
      <div className="monitoring-status-bar"><span className={socketConnected && runtime.state === 'RUNNING' ? 'online' : ''}>● {socketConnected ? 'AI trực tuyến' : 'AI ngoại tuyến'}</span><span>Video {formatFps(selected.video.fps)}</span><span>AI {metric(diagnostics?.analysis_fps, ' FPS')}</span><PermissionGate permission={permissions.diagnosticsRead}><><span>Độ trễ {metric(diagnostics?.pipeline_ms, ' ms')}</span><span>Sai lệch {metric(diagnostics?.analysis_lag_ms, ' ms')}</span></></PermissionGate></div>
      {import.meta.env.DEV && can(permissions.diagnosticsRead) && <details className="card diagnostics-drawer"><summary>Chẩn đoán runtime</summary><div className="diagnostics-grid"><span>Runtime ID <strong>{diagnostics?.runtime_instance_id ?? runtime.runtime_instance_id ?? '—'}</strong></span><span>Generation <strong>{diagnostics?.runtime_generation ?? runtime.runtime_generation ?? '—'}</strong></span><span>Worker ID <strong>{diagnostics?.worker_instance_id ?? runtime.worker_instance_id ?? '—'}</strong></span><span>Tracker ID <strong>{diagnostics?.tracker_instance_id ?? runtime.tracker_instance_id ?? '—'}</strong></span><span>Tracking seq <strong>{diagnostics?.tracking_seq ?? runtime.tracking_seq}</strong></span><span>Latest AI timestamp <strong>{diagnostics ? `${diagnostics.latest_timestamp_ms} ms` : '—'}</strong></span><span>Raw detections <strong>{diagnostics?.raw_detection_count ?? '—'}</strong></span><span>Active tracks <strong>{diagnostics?.active_track_count ?? '—'}</strong></span><span>Source FPS <strong>{metric(diagnostics?.source_fps)}</strong></span><span>Analysis FPS <strong>{metric(diagnostics?.analysis_fps)}</strong></span><span>Target FPS <strong>{metric(diagnostics?.target_analysis_fps)}</strong></span><span>Detector <strong>{metric(diagnostics?.detector_ms, ' ms')}</strong></span><span>Tracker <strong>{metric(diagnostics?.tracker_ms, ' ms')}</strong></span><span>Pipeline <strong>{metric(diagnostics?.pipeline_ms, ' ms')}</strong></span><span>Analysis lag <strong>{metric(diagnostics?.analysis_lag_ms, ' ms')}</strong></span><span>GPU <strong>{metric(diagnostics?.gpu_util_pct, '%')}</strong></span><span>VRAM <strong>{metric(diagnostics?.vram_used_mb, ' MB')}</strong></span><span>CPU <strong>{metric(diagnostics?.cpu_util_pct, '%')}</strong></span><span>RAM <strong>{metric(diagnostics?.ram_used_mb, ' MB')}</strong></span><span>Dropped <strong>{diagnostics?.dropped_analysis_frames ?? '—'}</strong></span><span>Queue <strong>{diagnostics?.queue_size ?? '—'}</strong></span><span>Profile <strong>{diagnostics?.profile ?? runtime.profile ?? '—'}</strong></span></div></details>}
    </>}
    <ConfirmDialog open={confirmStop} title="Kết thúc giám sát?" description="Phiên thi sẽ chuyển sang Đã kết thúc. Hãy chắc chắn video và quá trình giám sát đã hoàn tất." confirmLabel="Kết thúc giám sát" danger onCancel={() => setConfirmStop(false)} onConfirm={() => { setConfirmStop(false); void stop() }} />
  </div>
}
