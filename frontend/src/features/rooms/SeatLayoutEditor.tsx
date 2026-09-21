import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { apiErrorMessage } from '../../shared/api/errors'
import { ErrorState } from '../../shared/components/ErrorState'
import { saveSeats } from './api'
import type { Seat } from './types'

interface DragState {
  index: number
  mode: 'move' | 'resize'
  pointerX: number
  pointerY: number
  original: Seat
}

function copySeats(seats: Seat[]): Seat[] {
  return seats.map((seat) => ({ ...seat }))
}

export function SeatLayoutEditor({
  roomId,
  initialSeats,
  editable,
  onSaved,
}: {
  roomId: string
  initialSeats: Seat[]
  editable: boolean
  onSaved(seats: Seat[]): void
}) {
  const [seats, setSeats] = useState(() => copySeats(initialSeats))
  const [drag, setDrag] = useState<DragState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const areaRef = useRef<HTMLDivElement>(null)

  useEffect(() => setSeats(copySeats(initialSeats)), [initialSeats])

  useEffect(() => {
    if (!drag) return
    const move = (event: PointerEvent) => {
      const bounds = areaRef.current?.getBoundingClientRect()
      if (!bounds) return
      const dx = (event.clientX - drag.pointerX) / bounds.width
      const dy = (event.clientY - drag.pointerY) / bounds.height
      setSeats((current) => current.map((seat, index) => {
        if (index !== drag.index) return seat
        if (drag.mode === 'move') {
          return {
            ...seat,
            x: Math.max(0, Math.min(1 - seat.width, drag.original.x + dx)),
            y: Math.max(0, Math.min(1 - seat.height, drag.original.y + dy)),
          }
        }
        return {
          ...seat,
          width: Math.max(0.04, Math.min(1 - seat.x, drag.original.width + dx)),
          height: Math.max(0.04, Math.min(1 - seat.y, drag.original.height + dy)),
        }
      }))
    }
    const stop = () => setDrag(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
  }, [drag])

  const startDrag = (
    event: ReactPointerEvent,
    index: number,
    mode: DragState['mode'],
  ) => {
    if (!editable) return
    event.preventDefault()
    event.stopPropagation()
    setDrag({
      index,
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      original: { ...seats[index] },
    })
  }

  const addSeat = () => {
    const used = new Set(seats.map((seat) => seat.code))
    let number = seats.length + 1
    while (used.has(`A${String(number).padStart(2, '0')}`)) number += 1
    setSeats((current) => [...current, {
      code: `A${String(number).padStart(2, '0')}`,
      x: 0.05,
      y: 0.05,
      width: 0.14,
      height: 0.11,
      sort_order: current.length,
      is_active: true,
    }])
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const saved = await saveSeats(roomId, seats.map((seat, index) => ({
        ...seat,
        code: seat.code.trim().toUpperCase(),
        sort_order: index,
      })))
      setSeats(copySeats(saved))
      onSaved(saved)
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card layout-editor">
      <div className="section-heading">
        <div>
          <h2>Sơ đồ ghế</h2>
          <p>Tọa độ được lưu theo tỷ lệ chuẩn hóa, không phụ thuộc kích thước màn hình.</p>
        </div>
        {editable && <button className="secondary-button" type="button" onClick={addSeat}>Thêm ghế</button>}
      </div>
      {error && <ErrorState message={error} />}
      <div className="calibration-area" ref={areaRef} aria-label="Vùng hiệu chỉnh ghế">
        <span className="calibration-label">Vùng hiệu chỉnh trung tính</span>
        {seats.map((seat, index) => (
          <div
            className="seat-box"
            key={seat.id ?? `${seat.code}-${index}`}
            style={{
              left: `${seat.x * 100}%`,
              top: `${seat.y * 100}%`,
              width: `${seat.width * 100}%`,
              height: `${seat.height * 100}%`,
            }}
            onPointerDown={(event) => startDrag(event, index, 'move')}
          >
            <strong>{seat.code}</strong>
            {editable && (
              <button
                aria-label={`Đổi kích thước ghế ${seat.code}`}
                className="resize-handle"
                type="button"
                onPointerDown={(event) => startDrag(event, index, 'resize')}
              />
            )}
          </div>
        ))}
      </div>
      {seats.length === 0 && <p className="empty-copy">Chưa có ghế trong phòng.</p>}
      {editable && seats.map((seat, index) => (
        <div className="seat-row" key={seat.id ?? index}>
          <label htmlFor={`seat-${index}`}>Ghế {index + 1}</label>
          <input
            id={`seat-${index}`}
            value={seat.code}
            onChange={(event) => setSeats((current) => current.map((item, itemIndex) => (
              itemIndex === index ? { ...item, code: event.target.value } : item
            )))}
          />
          <button className="danger-link" type="button" onClick={() => (
            setSeats((current) => current.filter((_, itemIndex) => itemIndex !== index))
          )}>Xóa</button>
        </div>
      ))}
      {editable && (
        <div className="button-row">
          <button className="primary-button" type="button" onClick={submit} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu sơ đồ'}
          </button>
          <button className="secondary-button" type="button" onClick={() => setSeats(copySeats(initialSeats))}>
            Hủy thay đổi
          </button>
        </div>
      )}
    </section>
  )
}
