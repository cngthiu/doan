import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { apiErrorMessage } from '../../shared/api/errors'
import { ErrorState } from '../../shared/components/ErrorState'
import { LoadingState } from '../../shared/components/LoadingState'
import { useAuth } from '../auth/AuthProvider'
import { getRooms } from '../rooms/api'
import type { Room } from '../rooms/types'
import { createSession, getSessions } from './api'
import type { ExamSession, SessionInput } from './types'

const blank: SessionInput = {
  session_code: '', exam_name: '', room_id: '', scheduled_start: null,
  scheduled_end: null, runtime_profile: null,
}

function displayDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Chưa đặt lịch'
}

export function SessionsPage() {
  const { user } = useAuth()
  const canCreate = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR'
  const [items, setItems] = useState<ExamSession[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [form, setForm] = useState<SessionInput>(blank)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [sessions, roomItems] = await Promise.all([getSessions(), getRooms()])
      setItems(sessions); setRooms(roomItems.filter((room) => room.is_active))
    } catch (requestError) { setError(apiErrorMessage(requestError)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null)
    try {
      await createSession({
        ...form,
        scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null,
        scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
      })
      setForm(blank); setShowForm(false); await load()
    } catch (requestError) { setError(apiErrorMessage(requestError)) }
  }

  if (loading && items.length === 0) return <LoadingState message="Đang tải phiên thi…" />

  return <div className="page-stack">
    <div className="page-heading">
      <div><p className="eyebrow">NGHIỆP VỤ</p><h1>Phiên thi</h1></div>
      {canCreate && <button className="primary-button" type="button" onClick={() => setShowForm(!showForm)}>Tạo phiên thi</button>}
    </div>
    {error && <ErrorState message={error} />}
    {showForm && <section className="card"><h2>Phiên thi mới</h2><form className="form-grid" onSubmit={submit}>
      <label>Mã phiên<input value={form.session_code} onChange={(e) => setForm({ ...form, session_code: e.target.value })} required /></label>
      <label>Tên kỳ thi<input value={form.exam_name} onChange={(e) => setForm({ ...form, exam_name: e.target.value })} required /></label>
      <label>Phòng<select value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })} required><option value="">Chọn phòng</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.code} — {room.name}</option>)}</select></label>
      <label>Bắt đầu dự kiến<input type="datetime-local" value={form.scheduled_start ?? ''} onChange={(e) => setForm({ ...form, scheduled_start: e.target.value || null })} /></label>
      <label>Kết thúc dự kiến<input type="datetime-local" value={form.scheduled_end ?? ''} onChange={(e) => setForm({ ...form, scheduled_end: e.target.value || null })} /></label>
      <div className="button-row"><button className="primary-button" type="submit">Tạo phiên</button><button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Hủy</button></div>
    </form></section>}
    <section className="card table-wrap"><table><thead><tr><th>Kỳ thi</th><th>Mã phiên</th><th>Phòng</th><th>Thời gian</th><th>Trạng thái</th><th>Thí sinh</th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}><td><Link to={`/sessions/${item.id}`}>{item.exam_name}</Link></td><td>{item.session_code}</td><td>{item.room.code} — {item.room.name}</td><td>{displayDate(item.scheduled_start)}</td><td><span className={`status-pill ${item.status === 'READY' ? 'success' : ''}`}>{item.status}</span></td><td>{item.candidate_count}</td></tr>)}
    </tbody></table>{items.length === 0 && <p className="empty-copy">Chưa có phiên thi.</p>}</section>
  </div>
}
