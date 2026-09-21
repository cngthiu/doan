import { useEffect, useState, type FormEvent } from 'react'

import { apiErrorMessage } from '../../shared/api/errors'
import { ErrorState } from '../../shared/components/ErrorState'
import { LoadingState } from '../../shared/components/LoadingState'
import { useAuth } from '../auth/AuthProvider'
import { createCandidate, getCandidates, updateCandidate } from './api'
import type { Candidate, CandidateInput } from './types'

const blank: CandidateInput = { candidate_code: '', full_name: '', class_name: null, note: null }

export function CandidatesPage() {
  const { user } = useAuth()
  const editable = user?.role === 'ADMIN'
  const [items, setItems] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [form, setForm] = useState<CandidateInput>(blank)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (search = query) => {
    setLoading(true)
    try { setItems(await getCandidates(search)) }
    catch (requestError) { setError(apiErrorMessage(requestError)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load('') }, [])

  const select = (candidate: Candidate) => {
    setSelected(candidate)
    setForm({
      candidate_code: candidate.candidate_code,
      full_name: candidate.full_name,
      class_name: candidate.class_name,
      note: candidate.note,
    })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      const saved = selected
        ? await updateCandidate(selected.id, form)
        : await createCandidate(form)
      await load()
      select(saved)
    } catch (requestError) { setError(apiErrorMessage(requestError)) }
  }

  if (loading && items.length === 0 && !query) return <LoadingState message="Đang tải thí sinh…" />

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div><p className="eyebrow">NGHIỆP VỤ</p><h1>Thí sinh</h1></div>
        {editable && <button className="primary-button" type="button" onClick={() => { setSelected(null); setForm(blank) }}>Tạo thí sinh</button>}
      </div>
      {error && <ErrorState message={error} />}
      <form className="search-row" onSubmit={(event) => { event.preventDefault(); void load() }}>
        <input aria-label="Tìm thí sinh" placeholder="Tìm theo mã, họ tên hoặc lớp…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="secondary-button" type="submit">Tìm kiếm</button>
      </form>
      <div className="split-layout">
        <section className="card">
          <h2>Danh sách thí sinh</h2>
          <div className="list-stack">
            {items.map((candidate) => (
              <button className={`list-item ${selected?.id === candidate.id ? 'selected' : ''}`} type="button" key={candidate.id} onClick={() => select(candidate)}>
                <span><strong>{candidate.candidate_code}</strong><small>{candidate.full_name}</small></span>
                <span>{candidate.class_name ?? '—'}</span>
              </button>
            ))}
            {items.length === 0 && <p className="empty-copy">Không tìm thấy thí sinh.</p>}
          </div>
        </section>
        <section className="card">
          <h2>{selected ? 'Hồ sơ cơ bản' : 'Tạo thí sinh'}</h2>
          {!selected && !editable && <p className="empty-copy">Chọn một thí sinh để xem hồ sơ.</p>}
          {(selected || editable) && <form onSubmit={submit}>
            <label htmlFor="candidate-code">Mã thí sinh</label>
            <input id="candidate-code" value={form.candidate_code} disabled={!editable} onChange={(e) => setForm({ ...form, candidate_code: e.target.value })} required />
            <label htmlFor="candidate-name">Họ và tên</label>
            <input id="candidate-name" value={form.full_name} disabled={!editable} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            <label htmlFor="candidate-class">Lớp</label>
            <input id="candidate-class" value={form.class_name ?? ''} disabled={!editable} onChange={(e) => setForm({ ...form, class_name: e.target.value || null })} />
            <label htmlFor="candidate-note">Ghi chú</label>
            <textarea id="candidate-note" value={form.note ?? ''} disabled={!editable} onChange={(e) => setForm({ ...form, note: e.target.value || null })} />
            {editable && <button className="primary-button" type="submit">{selected ? 'Lưu hồ sơ' : 'Tạo thí sinh'}</button>}
          </form>}
          {selected && <div className="placeholder-panel"><strong>Các phiên thi</strong><p>Chưa có dữ liệu phiên thi trong Phase 2.</p></div>}
        </section>
      </div>
    </div>
  )
}
