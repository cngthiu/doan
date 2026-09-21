# ExamGuard — Greenfield System Architecture

## High level
```text
React
 ├── HTML5 Video
 ├── Canvas Overlay
 ├── Session/Candidate/Event UI
 ├── Axios REST
 └── Native WebSocket
          ↓
FastAPI
 ├── REST API
 ├── WebSocket
 ├── Auth
 ├── Business Services
 └── Monitoring Runtime
       Video Decoder → Scheduler → YOLO11n → ByteTrack
          ↓
PostgreSQL + Media Storage
```

## Playback path
```text
Uploaded MP4 → media endpoint → browser HTML5 <video> → native H.264 decode
```
The player must not depend on AI inference FPS.

## AI path
```text
same MP4 → decoder → timestamp → frame sampler → YOLO11n → ByteTrack → TrackingFrame → WebSocket
```

GTX1650 target: 12.5 FPS, degrade to 10 or 8 FPS if needed. Never accumulate old frames.

## Runtime data
Recommended typed objects:
```text
FramePacket
Detection
Track
TrackingFrame
RuntimeDiagnostics
MonitoringRuntimeState
```

TrackingFrame contains session_id, frame_id, timestamp_ms, source dimensions and tracks. Each Track contains track_id, normalized bbox and confidence.

## Realtime state
Keep tracking state in memory. Runtime components may include MonitoringRuntimeManager, VideoAnalysisWorker, LatestFrameBuffer, TrackStateStore and WebSocketPublisher.

## Future identity
```text
Track → Seat → SessionCandidate → Candidate
```
Architecture must allow seat_id/session_candidate_id later without redesign.

## Future action pipeline
```text
Track/Seat → single/pair proposals → ROI → TSM R3 → smoothing → event state machine → Event
```
Not part of the initial rebuild milestone.

## Frontend synchronization
```text
video.currentTime → timestamp_ms → nearest TrackingFrame → Canvas
```
Use requestVideoFrameCallback where supported. Handle resize, fullscreen and letterboxing correctly.

## Seek
```text
clear overlay → clear metadata buffer → seek video → backend seek → reset analysis clock → wait for new metadata
```
Never show old boxes after seek.

## Diagnostics
Publish about 2 Hz: source FPS, analysis FPS, detector/tracker/pipeline latency, dropped frames, GPU/VRAM if available, CPU and RAM. Do not crash if NVML is unavailable.

## Docker services
Initial services:
```text
frontend
backend
postgres
```
Backend gets GPU access. Do not split detector/tracker into microservices.
