import type { ReactNode } from 'react'

import type { ExamSession } from './types'

export function SessionReadinessPanel({ session, actions }: {
  session: ExamSession
  actions?: ReactNode
}) {
  const seatCount = session.readiness.active_seats
  const missingAssignments = Math.max(0, seatCount - session.candidate_count)
  const assignmentsReady = session.candidate_count > 0 && missingAssignments === 0
  return <section className="card preflight-panel">
    <div className="section-heading"><div><p className="panel-label">SẴN SÀNG GIÁM SÁT</p><h2>Kiểm tra trước khi bắt đầu</h2></div></div>
    <ul className="preflight-list">
      <li className={session.readiness.room_active ? 'ready' : 'warning'}><span>{session.readiness.room_active ? '✓' : '!'}</span><div><strong>Phòng thi</strong><small>{session.room.code} — {session.room.name}</small></div></li>
      <li className={session.readiness.seat_layout_available ? 'ready' : 'warning'}><span>{session.readiness.seat_layout_available ? '✓' : '!'}</span><div><strong>Bố trí chỗ ngồi</strong><small>{seatCount ? `${seatCount} chỗ ngồi` : 'Chưa có chỗ ngồi'}</small></div></li>
      <li className={assignmentsReady ? 'ready' : 'warning'}><span>{assignmentsReady ? '✓' : '!'}</span><div><strong>Danh sách thí sinh</strong><small>{missingAssignments ? `${missingAssignments} chỗ ngồi chưa có thí sinh` : `${session.candidate_count} thí sinh đã xếp chỗ`}</small></div></li>
      <li className={session.video ? 'ready' : 'warning'}><span>{session.video ? '✓' : '!'}</span><div><strong>Video nguồn</strong><small>{session.video?.original_filename ?? 'Chưa có video'}</small></div></li>
      <li><span>i</span><div><strong>Hệ thống AI</strong><small>Được kiểm tra thực tế khi bắt đầu giám sát</small></div></li>
    </ul>
    {actions && <div className="button-row">{actions}</div>}
  </section>
}
