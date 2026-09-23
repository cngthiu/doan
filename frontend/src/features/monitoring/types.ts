export type RuntimeState = 'INACTIVE' | 'INITIALIZING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ERROR'
export type AssignmentState = 'UNASSIGNED' | 'TENTATIVE' | 'ASSIGNED'
export type SeatOccupancyState = 'EMPTY' | 'OCCUPIED' | 'GRACE'

export interface TrackIdentity {
  state: AssignmentState
  seat_id: string | null
  seat_code: string | null
  session_candidate_id: string | null
  score: number | null
}

export interface TrackingTrack {
  track_id: number
  bbox_norm: [number, number, number, number]
  confidence: number
  identity: TrackIdentity
}

export interface SeatRuntime {
  seat_id: string
  seat_code: string
  session_candidate_id: string | null
  state: SeatOccupancyState
  track_id: number | null
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
  seats: SeatRuntime[]
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
  seat_assignment_ms: number | null
  analysis_lag_ms: number
  gpu_util_pct: number | null
  vram_used_mb: number | null
  cpu_util_pct: number | null
  ram_used_mb: number | null
  dropped_analysis_frames: number
  queue_size: number
  assigned_tracks: number
  tentative_tracks: number
  unassigned_tracks: number
  occupied_seats: number
  grace_seats: number
  empty_seats: number
  seat_switches: number
  identity_recoveries: number
  active_single_proposals: number
  active_pair_proposals: number
  ready_action_buffers: number
  active_action_buffers: number
  buffered_roi_frames: number
  action_predictions_total: number
  action_predictions_per_second: number
  tsm_preprocess_ms_mean: number | null
  tsm_preprocess_ms_p95: number | null
  tsm_inference_ms_mean: number | null
  tsm_inference_ms_p95: number | null
  action_pipeline_ms_mean: number | null
  action_pipeline_ms_p95: number | null
  action_batch_size_mean: number | null
  action_batch_size_p95: number | null
  action_queue_depth: number
  stale_action_requests_dropped: number
  action_device: string | null
  scheduler_ready_proposals: number
  scheduler_in_flight_proposals: number
  expired_ready_requests: number
  replaced_ready_requests: number
  action_batches_total: number
  single_predictions_per_second: number
  pair_predictions_per_second: number
  single_prediction_interval_ms_mean: number | null
  single_prediction_interval_ms_p95: number | null
  single_prediction_interval_ms_max: number | null
  pair_prediction_interval_ms_mean: number | null
  pair_prediction_interval_ms_p95: number | null
  pair_prediction_interval_ms_max: number | null
  action_prediction_age_ms_mean: number | null
  action_prediction_age_ms_p95: number | null
  tsm_forward_ms_mean: number | null
  tsm_forward_ms_p95: number | null
  profile: string
}

export type ActionClass = 'normal' | 'suspicious_looking' | 'communicating' | 'exchange_object' | 'using_phone/cheat_sheet'

export interface ActionPrediction {
  proposal_id: string
  proposal_type: 'SINGLE' | 'PAIR'
  session_candidate_ids: string[]
  seat_codes: string[]
  timestamp_ms: number
  class_probabilities: Record<ActionClass, number>
  predicted_class: ActionClass
  confidence: number
  model_name: string
}

export interface ActionPredictionMessage {
  type: 'action_prediction'
  session_id: string
  runtime_instance_id: string
  runtime_generation: number
  timestamp_ms: number
  predictions: ActionPrediction[]
}

export interface ActionErrorMessage {
  type: 'action_error'
  session_id: string
  runtime_instance_id: string
  runtime_generation: number
  timestamp_ms: number
  error: string
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

export type MonitoringMessage = TrackingFrame | RuntimeDiagnostics | RuntimeStateMessage | ActionPredictionMessage | ActionErrorMessage

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
