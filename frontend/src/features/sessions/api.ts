import { apiClient } from '../../shared/api/client'
import type { ExamSession, SessionInput } from './types'

export async function getSessions(): Promise<ExamSession[]> {
  return (await apiClient.get<ExamSession[]>('/sessions')).data
}

export async function getSession(id: string): Promise<ExamSession> {
  return (await apiClient.get<ExamSession>(`/sessions/${id}`)).data
}

export async function createSession(payload: SessionInput): Promise<ExamSession> {
  return (await apiClient.post<ExamSession>('/sessions', payload)).data
}

export async function updateSession(
  id: string,
  payload: Partial<SessionInput> & { status?: 'READY'; video_asset_id?: string | null },
): Promise<ExamSession> {
  return (await apiClient.patch<ExamSession>(`/sessions/${id}`, payload)).data
}

export async function saveAssignments(
  id: string,
  assignments: Array<{ candidate_id: string; seat_id: string }>,
): Promise<ExamSession> {
  return (await apiClient.put<ExamSession>(`/sessions/${id}/candidates`, { assignments })).data
}
