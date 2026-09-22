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
       Video Decoder → Scheduler → YOLO11n → ByteTrack → Seat-Stable Identity
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
same MP4 → decoder → timestamp → frame sampler → YOLO11n → ByteTrack
         → Seat-Stable Identity → TrackingFrame → WebSocket
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

TrackingFrame contains session/runtime identifiers, frame/timestamp, source dimensions,
tracks, and runtime seat occupancy. Each Track contains an ephemeral track ID, normalized
bbox, confidence, and a small runtime identity result. It never contains a full Candidate.

## Realtime state
Keep tracking state in memory. Runtime components may include MonitoringRuntimeManager, VideoAnalysisWorker, LatestFrameBuffer, TrackStateStore and WebSocketPublisher.

## Seat-Stable Identity
```text
Track → Seat → SessionCandidate → Candidate
```
At runtime start the backend loads the session Room, active Seats, SessionCandidates and
Candidates once. The CPU-side matcher uses source-video normalized coordinates and keeps
UNASSIGNED/TENTATIVE/ASSIGNED track state plus EMPTY/OCCUPIED/GRACE seat state in memory.
Track IDs remain ephemeral; a replacement track can resolve to the same Candidate through
the same Seat. Seek resets ByteTrack and all identity state. Pause advances no identity timer
because every transition uses video timestamps rather than wall clock.

## Future action pipeline
```text
Seat-Stable Identity → Proposal Builder → ROI → TSM R3 → smoothing → event state machine → Event
```
Proposal Builder and everything after it remain future work.

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
