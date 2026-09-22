import { apiClient } from '../../shared/api/client'
import type { PageQuery, PageResponse } from '../../shared/api/types'
import type { ExamSession, SessionInput, SessionStatus } from './types'

export async function getSessions({ page = 1, pageSize = 20, query = '', status }: PageQuery & { status?: SessionStatus } = {}): Promise<PageResponse<ExamSession>> {
  return (await apiClient.get<PageResponse<ExamSession>>('/sessions', {
    params: { page, page_size: pageSize, ...(query.trim() ? { q: query.trim() } : {}), ...(status ? { status } : {}) },
  })).data
}

export async function getSession(id: string): Promise<ExamSession> {
  return (await apiClient.get<ExamSession>(`/sessions/${id}`)).data
}

export async function createSession(payload: SessionInput): Promise<ExamSession> {
  return (await apiClient.post<ExamSession>('/sessions', payload)).data
}

export async function updateSession(
  id: string,
  payload: Partial<SessionInput> & { status?: SessionStatus; video_asset_id?: string | null },
): Promise<ExamSession> {
  return (await apiClient.patch<ExamSession>(`/sessions/${id}`, payload)).data
}

export async function saveAssignments(
  id: string,
  assignments: Array<{ candidate_id: string; seat_id: string }>,
): Promise<ExamSession> {
  return (await apiClient.put<ExamSession>(`/sessions/${id}/candidates`, { assignments })).data
}
