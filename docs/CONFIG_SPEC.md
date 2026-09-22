# ExamGuard — Configuration Specification

Use `.env` for secrets/deployment, YAML for AI/runtime behavior and Pydantic Settings for validation.

## .env example
```env
APP_ENV=development
APP_PROFILE=gtx1650
DATABASE_URL=postgresql+psycopg://examguard:examguard@db:5432/examguard
JWT_SECRET=CHANGE_ME
JWT_ALGORITHM=HS256
UPLOAD_ROOT=/data/uploads
EVIDENCE_ROOT=/data/evidence
MODEL_ROOT=/models
CUDA_VISIBLE_DEVICES=0
```

## GTX1650
```yaml
profile: gtx1650
runtime:
  device: cuda:0
  precision: fp16
video:
  realtime_analysis: true
  drop_stale_analysis_frames: true
analysis:
  target_fps: 12.5
  minimum_fps: 10.0
  queue_size: 1
detector:
  model: /models/detection/yolo11n.pt
  imgsz: 640
  conf: 0.10
  iou: 0.50
  classes: [0]
  max_det: 64
  half: true
  duplicate_suppression:
    enabled: true
    containment_threshold: 0.90
    max_area_ratio: 0.70
    max_center_distance_ratio: 0.35
    preferred_detection_confidence: 0.25
    larger_box_min_confidence_ratio: 0.65
tracker:
  config: /app/configs/tracking/bytetrack_exam.yaml
diagnostics:
  publish_hz: 2
ui:
  tracking_interpolation: false
  tracking_smoothing: false
  show_confidence_default: false
```

## RTX3060
```yaml
profile: rtx3060
runtime:
  device: cuda:0
  precision: fp16
video:
  realtime_analysis: true
  drop_stale_analysis_frames: true
analysis:
  target_fps: 18.0
  minimum_fps: 12.0
  queue_size: 1
detector:
  model: /models/detection/yolo11n.pt
  imgsz: 640
  conf: 0.10
  iou: 0.50
  classes: [0]
  max_det: 32
  half: true
  duplicate_suppression:
    enabled: true
    containment_threshold: 0.90
    max_area_ratio: 0.70
    max_center_distance_ratio: 0.35
    preferred_detection_confidence: 0.25
    larger_box_min_confidence_ratio: 0.65
tracker:
  config: /app/configs/tracking/bytetrack_exam_3060.yaml
diagnostics:
  publish_hz: 2
ui:
  tracking_interpolation: false
  tracking_smoothing: false
  show_confidence_default: false
```

Do not automatically use a larger YOLO model on RTX3060. Benchmark first.

## ByteTrack GTX1650
```yaml
tracker_type: bytetrack
track_high_thresh: 0.25
track_low_thresh: 0.10
new_track_thresh: 0.40
track_buffer: 30
match_thresh: 0.80
fuse_score: true
```

## ByteTrack RTX3060
```yaml
tracker_type: bytetrack
track_high_thresh: 0.25
track_low_thresh: 0.10
new_track_thresh: 0.40
track_buffer: 30
match_thresh: 0.80
fuse_score: true
```

At monitoring start, log active profile, detector model/config, tracker config and source metadata. Invalid config must fail fast. Do not silently fall back to CPU unless configured.

The stabilized `iou`, duplicate-suppression, and `new_track_thresh` values were selected from
controlled ablations on representative exam-room footage. Nested suppression is deliberately
limited to strongly contained, center-aligned boxes with materially different areas; adjacent
people that merely overlap are retained. Keep `conf=0.10` and `track_low_thresh=0.10` so
ByteTrack can still associate partially occluded people; do not raise either value merely to
reduce ID counts.
