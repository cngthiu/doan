import { useEffect, useState, type FormEvent } from 'react'

import { useAuth } from '../auth/AuthProvider'
import { apiErrorMessage } from '../../shared/api/errors'
import { ErrorState } from '../../shared/components/ErrorState'
import { LoadingState } from '../../shared/components/LoadingState'
import { createRoom, getRooms, getSeats, updateRoom } from './api'
import { SeatLayoutEditor } from './SeatLayoutEditor'
import type { Room, RoomInput, Seat } from './types'

const blankRoom: RoomInput = { code: '', name: '', description: null, is_active: true }

export function RoomsPage() {
  const { user } = useAuth()
  const editable = user?.role === 'ADMIN'
  const [rooms, setRooms] = useState<Room[]>([])
  const [selected, setSelected] = useState<Room | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const [form, setForm] = useState<RoomInput>(blankRoom)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getRooms()
      setRooms(data)
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const open = async (room: Room) => {
    setSelected(room)
    setForm({ code: room.code, name: room.name, description: room.description, is_active: room.is_active })
    setEditing(true)
    setError(null)
    try {
      setSeats(await getSeats(room.id))
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      const saved = selected ? await updateRoom(selected.id, form) : await createRoom(form)
      await load()
      await open(saved)
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    }
  }

  if (loading && rooms.length === 0) return <LoadingState message="Đang tải danh sách phòng…" />

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><p className="eyebrow">CÀI ĐẶT</p><h1>Phòng thi</h1></div>
        {editable && <button className="primary-button" type="button" onClick={() => {
          setSelected(null); setForm(blankRoom); setSeats([]); setEditing(true)
        }}>Tạo phòng</button>}
      </div>
      {error && <ErrorState message={error} />}
      <div className="split-layout">
        <section className="card">
          <h2>Danh sách phòng</h2>
          <div className="list-stack">
            {rooms.map((room) => (
              <button className={`list-item ${selected?.id === room.id ? 'selected' : ''}`} type="button" key={room.id} onClick={() => void open(room)}>
                <span><strong>{room.code}</strong><small>{room.name}</small></span>
                <span className={`status-pill ${room.is_active ? 'success' : 'muted'}`}>{room.is_active ? 'Hoạt động' : 'Đã tắt'}</span>
              </button>
            ))}
            {rooms.length === 0 && <p className="empty-copy">Chưa có phòng thi.</p>}
          </div>
        </section>
        <section className="card">
          <h2>{selected ? 'Thông tin phòng' : 'Tạo phòng mới'}</h2>
          {!editing && <p className="empty-copy">Chọn một phòng để xem chi tiết.</p>}
          {editing && (
            <form onSubmit={submit}>
              <label htmlFor="room-code">Mã phòng</label>
              <input id="room-code" value={form.code} disabled={!editable} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
              <label htmlFor="room-name">Tên phòng</label>
              <input id="room-name" value={form.name} disabled={!editable} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <label htmlFor="room-description">Mô tả</label>
              <textarea id="room-description" value={form.description ?? ''} disabled={!editable} onChange={(e) => setForm({ ...form, description: e.target.value || null })} />
              <label className="check-row"><input type="checkbox" checked={form.is_active} disabled={!editable} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Phòng đang hoạt động</label>
              {editable && <button className="primary-button" type="submit">{selected ? 'Lưu thông tin' : 'Tạo phòng'}</button>}
            </form>
          )}
        </section>
      </div>
      {selected && <SeatLayoutEditor key={selected.id} roomId={selected.id} initialSeats={seats} editable={Boolean(editable)} onSaved={setSeats} />}
    </div>
  )
}
