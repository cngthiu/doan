import { apiClient } from '../../shared/api/client'
import type { Candidate, CandidateInput } from './types'

export async function getCandidates(query = ''): Promise<Candidate[]> {
  return (await apiClient.get<Candidate[]>('/candidates', { params: query ? { q: query } : {} })).data
}

export async function createCandidate(payload: CandidateInput): Promise<Candidate> {
  return (await apiClient.post<Candidate>('/candidates', payload)).data
}

export async function updateCandidate(
  id: string,
  payload: Partial<CandidateInput>,
): Promise<Candidate> {
  return (await apiClient.patch<Candidate>(`/candidates/${id}`, payload)).data
}
