import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { apiContentErrorMessage, apiErrorField, apiErrorMessage } from '../../shared/api/errors'
import { EmptyState } from '../../shared/components/EmptyState'
import { ErrorState } from '../../shared/components/ErrorState'
import { FormField } from '../../shared/components/FormField'
import { LoadingState } from '../../shared/components/LoadingState'
import { PageHeader } from '../../shared/components/PageHeader'
import { Pagination } from '../../shared/components/Pagination'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/ToastProvider'
import { formatDateTime } from '../../shared/formatters'
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue'
import { sessionStatusLabels } from '../../shared/i18n/vi'
import { hasErrors, validateSession, type FieldErrors } from '../../shared/validation'
import { permissions, usePermissions } from '../auth/permissions'
import { getRooms } from '../rooms/api'
import type { Room } from '../rooms/types'
import { createSession, getSessions } from './api'
import {
  examDurationOptions,
  nextSessionCode,
  scheduledEnd,
  toLocalDateTimeInput,
  type ExamDurationMinutes,
} from './sessionForm'
import type { ExamSession, SessionInput, SessionStatus } from './types'

const blank: SessionInput = { session_code: '', exam_name: '', room_id: '', scheduled_start: null, scheduled_end: null, runtime_profile: null }
const pageSize = 20

export function SessionsPage() {
  const { can } = usePermissions()
  const toast = useToast()
  const canCreate = can(permissions.sessionManage)
  const [items, setItems] = useState<ExamSession[]>([])
  const [recentSessions, setRecentSessions] = useState<ExamSession[]>([])
  const [sessionTotal, setSessionTotal] = useState(0)
  const [rooms, setRooms] = useState<Room[]>([])
  const [form, setForm] = useState<SessionInput>(blank)
  const [durationMinutes, setDurationMinutes] = useState<ExamDurationMinutes>(45)
  const [showForm, setShowForm] = useState(false)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query)
  const [statusFilter, setStatusFilter] = useState<SessionStatus | ''>('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const load = useCallback(async (search: string, targetPage: number, selectedStatus: SessionStatus | '') => {
    setLoading(true); setError(null)
    try {
      const result = await getSessions({ query: search, page: targetPage, pageSize, status: selectedStatus || undefined })
      setItems(result.items); setTotal(result.total)
      if (!search.trim() && !selectedStatus && targetPage === 1) {
        setRecentSessions(result.items)
        setSessionTotal(result.total)
      }
    } catch (requestError) { setError(apiContentErrorMessage(requestError)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { setPage(1); void load(debouncedQuery, 1, statusFilter) }, [debouncedQuery, load, statusFilter])
  useEffect(() => {
    if (!canCreate) return
    getRooms({ pageSize: 100 }).then((result) => setRooms(result.items.filter((room) => room.is_active))).catch((requestError) => setError(apiContentErrorMessage(requestError)))
  }, [canCreate])

  const openCreateForm = () => {
    if (showForm) {
      setShowForm(false)
      return
    }
    setDurationMinutes(45)
    setForm({
      ...blank,
      session_code: nextSessionCode(recentSessions, sessionTotal),
      scheduled_start: toLocalDateTimeInput(new Date()),
    })
    setFieldErrors({})
    setShowForm(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const normalized = {
      ...form,
      session_code: form.session_code.trim(),
      exam_name: form.exam_name.trim(),
      scheduled_end: scheduledEnd(form.scheduled_start, durationMinutes),
    }
    const validation = validateSession(normalized)
    setFieldErrors(validation)
    if (hasErrors(validation)) return
    setSaving(true); setError(null)
    try {
      const created = await createSession({
        ...normalized,
        scheduled_start: normalized.scheduled_start ? new Date(normalized.scheduled_start).toISOString() : null,
        scheduled_end: normalized.scheduled_end ? new Date(normalized.scheduled_end).toISOString() : null,
      })
      setRecentSessions((current) => [created, ...current].slice(0, pageSize))
      setSessionTotal((current) => current + 1)
      toast.success('Đã thêm phiên thi.')
      setForm(blank); setShowForm(false); await load(debouncedQuery, page, statusFilter)
    } catch (requestError) {
      const field = apiErrorField(requestError)
      if (field) setFieldErrors((current) => ({ ...current, [field]: apiErrorMessage(requestError) }))
      else setError(apiErrorMessage(requestError))
    } finally { setSaving(false) }
  }

  if (loading && items.length === 0 && !query && !statusFilter) return <LoadingState message="Đang tải danh sách phiên thi…" />

  return <div className="page-stack">
    <PageHeader eyebrow="NGHIỆP VỤ" title="Phiên thi" actions={canCreate && <button className="primary-button" type="button" onClick={openCreateForm}>Thêm mới</button>} />
    {error && <ErrorState message={error} onRetry={() => void load(debouncedQuery, page, statusFilter)} />}
    {showForm && <section className="card"><h2>Thêm phiên thi</h2><form className="form-grid" onSubmit={submit} noValidate>
      <FormField label="Mã phiên thi" htmlFor="session-code" required error={fieldErrors.session_code} helper="Mã được tạo tự động theo phiên thi gần nhất."><input id="session-code" maxLength={100} value={form.session_code} readOnly /></FormField>
      <FormField label="Tên kỳ thi" htmlFor="exam-name" required error={fieldErrors.exam_name}><input id="exam-name" maxLength={255} value={form.exam_name} onChange={(event) => setForm({ ...form, exam_name: event.target.value })} /></FormField>
      <FormField label="Phòng thi" htmlFor="session-room" required error={fieldErrors.room_id}><select id="session-room" value={form.room_id} onChange={(event) => setForm({ ...form, room_id: event.target.value })}><option value="">Chọn phòng thi</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.code} — {room.name}</option>)}</select></FormField>
      <FormField label="Thời gian bắt đầu" htmlFor="scheduled-start"><input id="scheduled-start" type="datetime-local" value={form.scheduled_start ?? ''} onChange={(event) => setForm({ ...form, scheduled_start: event.target.value || null })} /></FormField>
      <FormField label="Thời gian thi" htmlFor="exam-duration" error={fieldErrors.scheduled_end} helper={form.scheduled_start ? `Kết thúc dự kiến: ${formatDateTime(scheduledEnd(form.scheduled_start, durationMinutes))}` : undefined}><select id="exam-duration" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value) as ExamDurationMinutes)}>{examDurationOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes} phút</option>)}</select></FormField>
      <div className="button-row"><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button><button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Hủy</button></div>
    </form></section>}
    <form className="filter-row" role="search" onSubmit={(event) => { event.preventDefault(); setPage(1); void load(query, 1, statusFilter) }}>
      <label className="sr-only" htmlFor="session-search">Tìm kiếm phiên thi</label>
      <input id="session-search" placeholder="Tìm theo mã, tên kỳ thi hoặc phòng thi…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <label className="sr-only" htmlFor="session-status-filter">Lọc theo trạng thái</label>
      <select id="session-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as SessionStatus | '')}><option value="">Tất cả trạng thái</option>{Object.entries(sessionStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button className="secondary-button" type="submit">Tìm kiếm</button>
    </form>
    <section className="card table-wrap">
      {loading && <p className="inline-loading">Đang tải…</p>}
      {items.length > 0 && <table><thead><tr><th>Kỳ thi</th><th>Mã phiên</th><th>Phòng thi</th><th>Thời gian</th><th>Trạng thái</th><th>Thí sinh</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id}><td><Link to={`/sessions/${item.id}`}>{item.exam_name}</Link></td><td>{item.session_code}</td><td>{item.room.code} — {item.room.name}</td><td>{formatDateTime(item.scheduled_start)}</td><td><StatusBadge status={item.status} /></td><td>{item.candidate_count}</td></tr>)}
      </tbody></table>}
      {!loading && items.length === 0 && <EmptyState title={query || statusFilter ? 'Không tìm thấy kết quả phù hợp.' : 'Chưa có phiên thi.'} description={!query && !statusFilter && canCreate ? 'Thêm phiên thi mới để bắt đầu.' : undefined} />}
      <Pagination page={page} pageSize={pageSize} total={total} onChange={(next) => { setPage(next); void load(debouncedQuery, next, statusFilter) }} />
    </section>
  </div>
}
