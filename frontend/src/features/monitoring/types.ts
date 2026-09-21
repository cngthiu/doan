export type RuntimeState = 'INACTIVE' | 'INITIALIZING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ERROR'

export interface TrackingTrack {
  track_id: number
  bbox_norm: [number, number, number, number]
  confidence: number
}

export interface TrackingFrame {
  type: 'tracking'
  session_id: string
  timestamp_ms: number
  frame_id: number
  source_width: number
  source_height: number
  tracks: TrackingTrack[]
}

export interface RuntimeDiagnostics {
  type: 'diagnostics'
  session_id: string
  source_fps: number
  target_analysis_fps: number
  analysis_fps: number
  detector_ms: number | null
  tracker_ms: number | null
  pipeline_ms: number | null
  analysis_lag_ms: number
  gpu_util_pct: number | null
  vram_used_mb: number | null
  cpu_util_pct: number | null
  ram_used_mb: number | null
  dropped_analysis_frames: number
  queue_size: number
  profile: string
}

export interface RuntimeStateMessage {
  type: 'state'
  session_id: string
  state: RuntimeState
  synchronizing: boolean
  error: string | null
}

export type MonitoringMessage = TrackingFrame | RuntimeDiagnostics | RuntimeStateMessage

export interface MonitoringStatus {
  session_id: string
  state: RuntimeState
  profile: string | null
  error: string | null
  subscriber_count: number
  queue_size: number
  dropped_analysis_frames: number
  diagnostics: RuntimeDiagnostics | null
}
