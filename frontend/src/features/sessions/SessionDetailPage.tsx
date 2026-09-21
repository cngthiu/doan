import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { apiErrorMessage } from '../../shared/api/errors'
import { ErrorState } from '../../shared/components/ErrorState'
import { LoadingState } from '../../shared/components/LoadingState'
import { useAuth } from '../auth/AuthProvider'
import { getCandidates } from '../candidates/api'
import type { Candidate } from '../candidates/types'
import { VideoMonitor } from '../media/VideoMonitor'
import { VideoUpload } from '../media/VideoUpload'
import type { MediaAsset } from '../media/types'
import { getSeats } from '../rooms/api'
import type { Seat } from '../rooms/types'
import { getSession, saveAssignments, updateSession } from './api'
import type { ExamSession } from './types'

export function SessionDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const canAssign = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR'
  const canManageVideo = canAssign
  const [session, setSession] = useState<ExamSession | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const detail = await getSession(id)
      const [seatItems, candidateItems] = await Promise.all([
        getSeats(detail.room_id), getCandidates(),
      ])
      setSession(detail); setSeats(seatItems); setCandidates(candidateItems)
      setValues(Object.fromEntries(detail.assignments.map((item) => [item.seat.id, item.candidate.id])))
    } catch (requestError) { setError(apiErrorMessage(requestError)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [id])

  const filteredCandidates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi')
    if (!term) return candidates
    return candidates.filter((item) => `${item.candidate_code} ${item.full_name}`.toLocaleLowerCase('vi').includes(term))
  }, [candidates, search])

  const choose = (seatId: string, candidateId: string) => {
    setError(null)
    if (candidateId && Object.entries(values).some(([otherSeat, candidate]) => otherSeat !== seatId && candidate === candidateId)) {
      setError('Thí sinh này đã được xếp vào một ghế khác.')
      return
    }
    setValues((current) => ({ ...current, [seatId]: candidateId }))
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const assignments = Object.entries(values)
        .filter(([, candidateId]) => Boolean(candidateId))
        .map(([seat_id, candidate_id]) => ({ seat_id, candidate_id }))
      const saved = await saveAssignments(id, assignments)
      setSession(saved)
    } catch (requestError) { setError(apiErrorMessage(requestError)) }
    finally { setSaving(false) }
  }

  const markReady = async () => {
    setSaving(true); setError(null)
    try { setSession(await updateSession(id, { status: 'READY' })) }
    catch (requestError) { setError(apiErrorMessage(requestError)) }
    finally { setSaving(false) }
  }

  const attachVideo = async (media: MediaAsset) => {
    setError(null)
    setSession(await updateSession(id, { video_asset_id: media.id }))
  }

  if (loading) return <LoadingState message="Đang tải chi tiết phiên thi…" />
  if (!session) return <div className="page-stack"><ErrorState message={error ?? 'Không tìm thấy phiên thi.'} /></div>

  return <div className="page-stack">
    <div className="breadcrumb"><Link to="/sessions">Phiên thi</Link><span>/</span><span>{session.session_code}</span></div>
    <div className="page-heading"><div><p className="eyebrow">CHI TIẾT PHIÊN</p><h1>{session.exam_name}</h1><p>{session.session_code} · {session.room.code} — {session.room.name}</p></div><span className={`status-pill large ${session.status === 'READY' ? 'success' : ''}`}>{session.status}</span></div>
    {error && <ErrorState message={error} />}
    <div className="readiness-grid">
      <div className="card"><h2>Mức độ sẵn sàng</h2><ul className="check-list">
        <li><span>Phòng đã chọn</span><strong>{session.readiness.room_selected ? '✓' : '—'}</strong></li>
        <li><span>Sơ đồ ghế khả dụng</span><strong>{session.readiness.seat_layout_available ? '✓' : '—'}</strong></li>
        <li><span>Thí sinh đã xếp</span><strong>{session.readiness.candidates_assigned}</strong></li>
        <li><span>Video</span><strong>{session.video?.original_filename ?? 'Chưa cấu hình'}</strong></li>
        <li><span>Giám sát</span><strong>Chưa bắt đầu</strong></li>
      </ul>{user?.role === 'ADMIN' && session.status === 'DRAFT' && <button className="primary-button" disabled={!session.readiness.can_mark_ready || saving} type="button" onClick={() => void markReady()}>Chuyển sang READY</button>}</div>
      <div className="card"><h2>Thông tin</h2><dl className="detail-list"><div><dt>Phòng</dt><dd>{session.room.code} — {session.room.name}</dd></div><div><dt>Bắt đầu dự kiến</dt><dd>{session.scheduled_start ? new Date(session.scheduled_start).toLocaleString('vi-VN') : 'Chưa đặt'}</dd></div><div><dt>Kết thúc dự kiến</dt><dd>{session.scheduled_end ? new Date(session.scheduled_end).toLocaleString('vi-VN') : 'Chưa đặt'}</dd></div></dl></div>
    </div>
    <section className="card media-section">
      <div className="section-heading"><div><h2>Video nguồn</h2><p>MP4/H.264 được phát trực tiếp bằng trình phát HTML5 của trình duyệt.</p></div></div>
      {session.video ? <>
        <div className="media-summary"><strong>{session.video.original_filename}</strong><span>{session.video.width}×{session.video.height} · {session.video.fps.toFixed(2)} FPS · {session.video.codec.toUpperCase()} · {(session.video.duration_ms / 60000).toFixed(1)} phút</span></div>
        <VideoMonitor mediaUrl={session.video.media_url} title={session.video.original_filename} />
      </> : <p className="empty-copy">Phiên thi chưa có video nguồn.</p>}
      {canManageVideo && (session.status === 'DRAFT' || session.status === 'READY') && <div className="video-upload-panel"><h3>{session.video ? 'Thay video nguồn' : 'Tải video lên'}</h3><VideoUpload onUploaded={attachVideo} /></div>}
    </section>
    <section className="card"><div className="section-heading"><div><h2>Thí sinh & Ghế</h2><p>Chọn thí sinh theo mã và họ tên; hệ thống không hiển thị UUID.</p></div>{canAssign && <button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Đang lưu…' : 'Lưu phân công'}</button>}</div>
      <input className="candidate-filter" placeholder="Lọc thí sinh trong danh sách chọn…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="assignment-list">{seats.map((seat) => <div className="assignment-row" key={seat.id}><strong>{seat.code}</strong><select disabled={!canAssign} value={values[seat.id ?? ''] ?? ''} onChange={(event) => choose(seat.id ?? '', event.target.value)}><option value="">Chưa xếp thí sinh</option>{filteredCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.candidate_code} — {candidate.full_name}</option>)}</select>{canAssign && values[seat.id ?? ''] && <button className="danger-link" type="button" onClick={() => choose(seat.id ?? '', '')}>Bỏ xếp</button>}</div>)}</div>
      {seats.length === 0 && <p className="empty-copy">Phòng chưa có sơ đồ ghế.</p>}
    </section>
  </div>
}
