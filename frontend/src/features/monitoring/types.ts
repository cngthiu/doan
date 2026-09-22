export type RuntimeState = 'INACTIVE' | 'INITIALIZING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ERROR'

export interface TrackingTrack {
  track_id: number
  bbox_norm: [number, number, number, number]
  confidence: number
}

export interface TrackingFrame {
  type: 'tracking'
  session_id: string
  runtime_instance_id: string
  runtime_generation: number
  tracker_instance_id: string
  tracking_seq: number
  timestamp_ms: number
  frame_id: number
  source_width: number
  source_height: number
  tracks: TrackingTrack[]
}

export interface RuntimeDiagnostics {
  type: 'diagnostics'
  session_id: string
  runtime_instance_id: string
  runtime_generation: number
  worker_instance_id: string
  tracker_instance_id: string
  tracking_seq: number
  latest_frame_id: number
  latest_timestamp_ms: number
  raw_detection_count: number
  active_track_count: number
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
  runtime_instance_id: string
  runtime_generation: number
  worker_instance_id: string | null
  tracker_instance_id: string | null
  tracking_seq: number
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
  runtime_instance_id: string | null
  runtime_generation: number | null
  worker_instance_id: string | null
  tracker_instance_id: string | null
  tracking_seq: number
}
