import { apiClient } from '../../shared/api/client'
import type { MonitoringStatus } from './types'

export async function getMonitoringStatus(sessionId: string): Promise<MonitoringStatus> {
  return (await apiClient.get<MonitoringStatus>(`/sessions/${sessionId}/monitoring-status`)).data
}

export async function startMonitoring(sessionId: string, timestampMs: number): Promise<MonitoringStatus> {
  return (await apiClient.post<MonitoringStatus>(`/sessions/${sessionId}/start`, { timestamp_ms: timestampMs })).data
}

export async function pauseMonitoring(sessionId: string, timestampMs: number): Promise<MonitoringStatus> {
  return (await apiClient.post<MonitoringStatus>(`/sessions/${sessionId}/pause`, { timestamp_ms: timestampMs })).data
}

export async function resumeMonitoring(sessionId: string): Promise<MonitoringStatus> {
  return (await apiClient.post<MonitoringStatus>(`/sessions/${sessionId}/resume`)).data
}

export async function seekMonitoring(sessionId: string, timestampMs: number): Promise<MonitoringStatus> {
  return (await apiClient.post<MonitoringStatus>(`/sessions/${sessionId}/seek`, { timestamp_ms: timestampMs })).data
}

export async function stopMonitoring(sessionId: string): Promise<MonitoringStatus> {
  return (await apiClient.post<MonitoringStatus>(`/sessions/${sessionId}/stop`)).data
}
