import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'

import { apiErrorField, apiErrorMessage } from '../../shared/api/errors'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { EmptyState } from '../../shared/components/EmptyState'
import { ErrorState } from '../../shared/components/ErrorState'
import { FormField } from '../../shared/components/FormField'
import { LoadingState } from '../../shared/components/LoadingState'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/ToastProvider'
import { formatDateTime, formatDurationMs, formatFps, formatResolution } from '../../shared/formatters'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue'
import { useUnsavedChanges } from '../../shared/hooks/useUnsavedChanges'
import { hasErrors, validateSession, valuesChanged, type FieldErrors } from '../../shared/validation'
import { useAuth } from '../auth/AuthProvider'
import { getCandidates } from '../candidates/api'
import type { Candidate } from '../candidates/types'
import { VideoMonitor } from '../media/VideoMonitor'
import { VideoUpload } from '../media/VideoUpload'
import type { MediaAsset } from '../media/types'
import { getSeats } from '../rooms/api'
import type { Seat } from '../rooms/types'
import { getSession, saveAssignments, updateSession } from './api'
import { SessionReadinessPanel } from './SessionReadinessPanel'
import type { ExamSession } from './types'

type CandidateOption = Pick<Candidate, 'id' | 'candidate_code' | 'full_name' | 'class_name'>
interface EditValues { session_code: string; exam_name: string; scheduled_start: string | null; scheduled_end: string | null }

function localDateTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function mergeCandidates(current: CandidateOption[], incoming: CandidateOption[]): CandidateOption[] {
  return [...new Map([...current, ...incoming].map((candidate) => [candidate.id, candidate])).values()]
}

export function SessionDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const canManage = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR'
  const [session, setSession] = useState<ExamSession | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const [candidates, setCandidates] = useState<CandidateOption[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [savedValues, setSavedValues] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [editingInfo, setEditingInfo] = useState(false)
  const [editValues, setEditValues] = useState<EditValues>({ session_code: '', exam_name: '', scheduled_start: null, scheduled_end: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [confirmCancel, setConfirmCancel] = useState(false)
  const dirtyAssignments = valuesChanged(values, savedValues)
  useUnsavedChanges(dirtyAssignments)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const detail = await getSession(id)
      const [seatItems, candidatePage] = await Promise.all([getSeats(detail.room_id), getCandidates({ pageSize: 50 })])
      const assignments = Object.fromEntries(detail.assignments.map((item) => [item.seat.id, item.candidate.id]))
      setSession(detail); setSeats(seatItems); setValues(assignments); setSavedValues(assignments)
      setCandidates(mergeCandidates(candidatePage.items, detail.assignments.map((item) => item.candidate)))
      setEditValues({ session_code: detail.session_code, exam_name: detail.exam_name, scheduled_start: localDateTime(detail.scheduled_start), scheduled_end: localDateTime(detail.scheduled_end) })
    } catch (requestError) { setError(apiErrorMessage(requestError)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [id])

  useEffect(() => {
    if (!session) return
    let active = true
    setCandidateLoading(true)
    getCandidates({ query: debouncedSearch, pageSize: 50 }).then((result) => {
      if (active) setCandidates((current) => mergeCandidates(current, result.items))
    }).catch((requestError) => { if (active) setError(apiErrorMessage(requestError)) })
      .finally(() => { if (active) setCandidateLoading(false) })
    return () => { active = false }
  }, [debouncedSearch, session?.id])

  const choose = (seatId: string, candidateId: string) => {
    setError(null)
    if (candidateId && Object.entries(values).some(([otherSeat, candidate]) => otherSeat !== seatId && candidate === candidateId)) {
      setError('Thí sinh này đã được xếp vào một chỗ ngồi khác.')
      return
    }
    setValues((current) => ({ ...current, [seatId]: candidateId }))
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const assignments = Object.entries(values).filter(([, candidateId]) => Boolean(candidateId)).map(([seat_id, candidate_id]) => ({ seat_id, candidate_id }))
      const saved = await saveAssignments(id, assignments)
      setSession(saved); setSavedValues({ ...values }); toast.success('Đã lưu phân công thí sinh.')
    } catch (requestError) { setError(apiErrorMessage(requestError)) }
    finally { setSaving(false) }
  }

  const markReady = async () => {
    setSaving(true); setError(null)
    try { const saved = await updateSession(id, { status: 'READY' }); setSession(saved); toast.success('Phiên thi đã sẵn sàng.') }
    catch (requestError) { setError(apiErrorMessage(requestError)) }
    finally { setSaving(false) }
  }

  const cancelSession = async () => {
    setSaving(true); setError(null)
    try { const saved = await updateSession(id, { status: 'CANCELLED' }); setSession(saved); toast.success('Đã hủy phiên thi.') }
    catch (requestError) { setError(apiErrorMessage(requestError)) }
    finally { setSaving(false); setConfirmCancel(false) }
  }

  const saveInfo = async (event: FormEvent) => {
    event.preventDefault()
    if (!session) return
    const validation = validateSession({ ...editValues, room_id: session.room_id })
    setFieldErrors(validation)
    if (hasErrors(validation)) return
    setSaving(true); setError(null)
    try {
      const saved = await updateSession(id, {
        session_code: editValues.session_code.trim(), exam_name: editValues.exam_name.trim(),
        scheduled_start: editValues.scheduled_start ? new Date(editValues.scheduled_start).toISOString() : null,
        scheduled_end: editValues.scheduled_end ? new Date(editValues.scheduled_end).toISOString() : null,
      })
      setSession(saved); setEditingInfo(false); toast.success('Đã cập nhật phiên thi.')
    } catch (requestError) {
      const field = apiErrorField(requestError)
      if (field) setFieldErrors((current) => ({ ...current, [field]: apiErrorMessage(requestError) }))
      else setError(apiErrorMessage(requestError))
    } finally { setSaving(false) }
  }

  const attachVideo = async (media: MediaAsset) => {
    setError(null)
    try { setSession(await updateSession(id, { video_asset_id: media.id })); toast.success('Đã gắn video nguồn vào phiên thi.') }
    catch (requestError) { setError(apiErrorMessage(requestError)) }
  }

  if (loading) return <LoadingState message="Đang tải phiên thi…" />
  if (!session) return <div className="page-stack"><ErrorState message={error ?? 'Không tìm thấy phiên thi.'} onRetry={() => void load()} /></div>
  const editable = canManage && (session.status === 'DRAFT' || session.status === 'READY')

  return <div className="page-stack">
    <div className="breadcrumb"><Link to="/sessions">Phiên thi</Link><span>/</span><span>{session.session_code}</span></div>
    <div className="page-heading"><div><p className="eyebrow">CHI TIẾT PHIÊN THI</p><h1>{session.exam_name}</h1><p>{session.session_code} · {session.room.code} — {session.room.name}</p></div><StatusBadge status={session.status} /></div>
    {error && <ErrorState message={error} onRetry={() => void load()} />}
    <SessionReadinessPanel session={session} actions={<>
      {editable && <Link className="secondary-button link-button" to="/">Mở màn hình giám sát</Link>}
      {session.status === 'DRAFT' && canManage && <button className="primary-button" disabled={!session.readiness.can_mark_ready || saving || dirtyAssignments} type="button" onClick={() => void markReady()}>Đánh dấu sẵn sàng</button>}
      {editable && <button className="danger-button subtle" disabled={saving} type="button" onClick={() => setConfirmCancel(true)}>Hủy phiên thi</button>}
    </>} />
    <div className="readiness-grid">
      <section className="card"><div className="section-heading"><h2>Thông tin phiên thi</h2>{editable && !editingInfo && <button className="secondary-button" type="button" onClick={() => setEditingInfo(true)}>Chỉnh sửa</button>}</div>
        {editingInfo ? <form onSubmit={saveInfo} noValidate>
          <FormField label="Mã phiên thi" htmlFor="detail-session-code" required error={fieldErrors.session_code}><input id="detail-session-code" maxLength={100} value={editValues.session_code} onChange={(event) => setEditValues({ ...editValues, session_code: event.target.value })} /></FormField>
          <FormField label="Tên kỳ thi" htmlFor="detail-exam-name" required error={fieldErrors.exam_name}><input id="detail-exam-name" maxLength={255} value={editValues.exam_name} onChange={(event) => setEditValues({ ...editValues, exam_name: event.target.value })} /></FormField>
          <FormField label="Bắt đầu dự kiến" htmlFor="detail-start"><input id="detail-start" type="datetime-local" value={editValues.scheduled_start ?? ''} onChange={(event) => setEditValues({ ...editValues, scheduled_start: event.target.value || null })} /></FormField>
          <FormField label="Kết thúc dự kiến" htmlFor="detail-end" error={fieldErrors.scheduled_end}><input id="detail-end" type="datetime-local" value={editValues.scheduled_end ?? ''} onChange={(event) => setEditValues({ ...editValues, scheduled_end: event.target.value || null })} /></FormField>
          <div className="button-row"><button className="primary-button" disabled={saving} type="submit">{saving ? 'Đang lưu…' : 'Lưu'}</button><button className="secondary-button" type="button" onClick={() => setEditingInfo(false)}>Hủy</button></div>
        </form> : <dl className="detail-list"><div><dt>Phòng thi</dt><dd>{session.room.code} — {session.room.name}</dd></div><div><dt>Bắt đầu dự kiến</dt><dd>{formatDateTime(session.scheduled_start)}</dd></div><div><dt>Kết thúc dự kiến</dt><dd>{formatDateTime(session.scheduled_end)}</dd></div></dl>}
      </section>
      <section className="card"><h2>Tóm tắt</h2><dl className="detail-list"><div><dt>Trạng thái</dt><dd><StatusBadge status={session.status} /></dd></div><div><dt>Chỗ ngồi</dt><dd>{seats.length}</dd></div><div><dt>Thí sinh</dt><dd>{session.candidate_count}</dd></div><div><dt>Video</dt><dd>{session.video ? 'Đã cấu hình' : 'Chưa cấu hình'}</dd></div></dl></section>
    </div>
    <section className="card media-section"><div className="section-heading"><div><h2>Video nguồn</h2><p>Video MP4/H.264 được phát bằng trình phát của trình duyệt.</p></div></div>
      {session.video ? <><div className="media-summary"><strong>{session.video.original_filename}</strong><span>{formatResolution(session.video.width, session.video.height)} · {formatFps(session.video.fps, 2)} · {session.video.codec.toUpperCase()} · {formatDurationMs(session.video.duration_ms)}</span></div><VideoMonitor mediaUrl={session.video.media_url} title={session.video.original_filename} /></> : <EmptyState title="Phiên thi chưa có video nguồn." />}
      {editable && <div className="video-upload-panel"><h3>{session.video ? 'Thay video nguồn' : 'Tải video lên'}</h3><VideoUpload onUploaded={attachVideo} /></div>}
    </section>
    <section className="card" id="assignments"><div className="section-heading"><div><h2>Thí sinh và chỗ ngồi</h2><p>Mỗi thí sinh và chỗ ngồi chỉ được sử dụng một lần trong phiên thi.</p></div>{editable && <button className="primary-button" type="button" disabled={saving || !dirtyAssignments} onClick={() => void save()}>{saving ? 'Đang lưu…' : 'Lưu phân công'}</button>}</div>
      <label htmlFor="assignment-search">Tìm thí sinh</label><input id="assignment-search" className="candidate-filter" placeholder="Nhập mã hoặc họ tên…" value={search} onChange={(event) => setSearch(event.target.value)} />
      {candidateLoading && <p className="inline-loading">Đang tìm thí sinh…</p>}
      <div className="assignment-list">{seats.map((seat) => <div className="assignment-row" key={seat.id}><strong>{seat.code}</strong><select disabled={!editable} value={values[seat.id ?? ''] ?? ''} onChange={(event) => choose(seat.id ?? '', event.target.value)}><option value="">Chưa xếp thí sinh</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.candidate_code} — {candidate.full_name}</option>)}</select>{editable && values[seat.id ?? ''] && <button className="danger-link" type="button" onClick={() => choose(seat.id ?? '', '')}>Bỏ xếp</button>}</div>)}</div>
      {seats.length === 0 && <EmptyState title="Phòng thi chưa có bố trí chỗ ngồi." />}
      {dirtyAssignments && <p className="unsaved-note">Có thay đổi phân công chưa được lưu.</p>}
    </section>
    <ConfirmDialog open={confirmCancel} title="Hủy phiên thi?" description="Phiên thi sẽ được lưu trong lịch sử với trạng thái đã hủy và không thể bắt đầu giám sát." confirmLabel="Hủy phiên thi" danger onCancel={() => setConfirmCancel(false)} onConfirm={() => void cancelSession()} />
  </div>
}
