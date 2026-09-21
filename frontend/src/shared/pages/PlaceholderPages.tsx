import { useEffect, useState } from 'react'

import { useAuth } from '../../features/auth/AuthProvider'
import { VideoMonitor } from '../../features/media/VideoMonitor'
import { VideoUpload } from '../../features/media/VideoUpload'
import type { MediaAsset } from '../../features/media/types'
import { getSessions, updateSession } from '../../features/sessions/api'
import type { ExamSession } from '../../features/sessions/types'
import { apiErrorMessage } from '../api/errors'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'

export function MonitoringPage() {
  const { user } = useAuth()
  const canManageVideo = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR'
  const [sessions, setSessions] = useState<ExamSession[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const selected = sessions.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch((requestError) => setError(apiErrorMessage(requestError)))
      .finally(() => setLoading(false))
  }, [])

  const attachVideo = async (media: MediaAsset) => {
    const updated = await updateSession(selectedId, { video_asset_id: media.id })
    setSessions((current) => current.map((item) => item.id === updated.id ? updated : item))
  }

  if (loading) return <LoadingState message="Đang tải phiên thi…" />

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">GIÁM SÁT</p><h1>Monitoring</h1><p>Chuẩn bị và kiểm tra video trước khi giám sát.</p></div></div>
    {error && <ErrorState message={error} />}
    <section className="card monitoring-selector">
      <label htmlFor="monitoring-session">Chọn phiên thi</label>
      <select id="monitoring-session" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setError(null) }}>
        <option value="">Chọn một phiên thi</option>
        {sessions.map((item) => <option key={item.id} value={item.id}>{item.session_code} — {item.exam_name}</option>)}
      </select>
    </section>
    {!selected && <section className="card empty-panel"><h2>Chọn một phiên thi</h2><p>Thông tin phòng, thí sinh và video sẽ xuất hiện tại đây.</p></section>}
    {selected && <>
      <section className="monitoring-summary">
        <div className="card"><span>Kỳ thi</span><strong>{selected.exam_name}</strong></div>
        <div className="card"><span>Phòng</span><strong>{selected.room.code}</strong></div>
        <div className="card"><span>Thí sinh</span><strong>{selected.candidate_count}</strong></div>
        <div className="card"><span>Video</span><strong>{selected.video ? 'Đã cấu hình' : 'Chưa cấu hình'}</strong></div>
      </section>
      <section className="card media-section">
        {selected.video ? <>
          <div className="media-summary"><strong>{selected.video.original_filename}</strong><span>{selected.video.width}×{selected.video.height} · {selected.video.fps.toFixed(2)} FPS · {selected.video.codec.toUpperCase()} · {(selected.video.duration_ms / 60000).toFixed(1)} phút</span></div>
          <VideoMonitor mediaUrl={selected.video.media_url} title={selected.video.original_filename} />
          <p className="monitoring-note">Video sẵn sàng để phát. Giám sát AI chưa được khởi động trong Phase 3.</p>
        </> : <>
          <h2>Phiên thi chưa có video</h2>
          {canManageVideo ? <VideoUpload onUploaded={attachVideo} /> : <p className="empty-copy">Bạn chỉ có quyền xem video đã được gắn vào phiên thi.</p>}
        </>}
      </section>
    </>}
  </div>
}

export function EmptyFeaturePage({ title }: { title: string }) {
  return <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">CHƯA KHẢ DỤNG</p><h1>{title}</h1></div></div><section className="card empty-panel"><p>Chức năng này chưa được triển khai trong Phase 2. Không có dữ liệu mẫu.</p></section></div>
}
