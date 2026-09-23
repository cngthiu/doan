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
                                       Single/Adjacent Pair Proposals
                                                   ↓
                                       Bounded timestamped R3 ROI buffers
                                                   ↓
                                      Fair Action Scheduler (latest/age/budget)
                                                   ↓
                                      Shared TSM R3 → raw probabilities
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
         → stable proposals → R3 ROI buffers → Action Scheduler
         → background TSM R3 → ActionPrediction
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

## Action-recognition runtime (Phase 6 + 6.5)
```text
Seat-Stable Identity → Proposal Builder → R3 ROI → 4-second timestamp buffer
                     → latest-ready Action Scheduler → shared TSM R3
                     → raw five-class ActionPrediction
```
Single proposals require an ASSIGNED SessionCandidate. Pair proposals require two
ASSIGNED candidates in geometrically adjacent left/right Seats. Proposal IDs use
SessionCandidate UUIDs, not ephemeral Track IDs. A queue of capacity one keeps
the latest action request; ROI preparation and TSM inference run in separate
background threads, preserving the tracking worker's latest-frame path.
The scheduler keeps one latest ready clip per stable proposal, applies a video-
timestamp stride and maximum age, chooses never-predicted then oldest-predicted
proposals deterministically, and limits each dispatch to a small batch. GTX1650
uses FP32/1500-ms/B2 because measured FP16 is slower and can be non-finite on
that GPU. Pause cannot advance scheduling by wall clock; seek resets buffers,
ready/in-flight state and last-prediction timestamps; stop joins both action
threads. The R3 model registry shares one checkpoint/device/precision instance.

The Phase 6 output is diagnostic model evidence only. Smoothing, event
thresholds/state machine, Event creation, Evidence and conduct conclusions are
future work and are not connected to ActionPrediction.

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
Publish about 2 Hz: source FPS, analysis FPS, detector/tracker/pipeline latency,
dropped frames, GPU/VRAM if available, CPU and RAM. Action diagnostics add
ready/in-flight/replaced/expired requests, Single/Pair prediction rates and
interval mean/P95/max, prediction age, batch count and TSM forward latency.
Do not crash if NVML is unavailable.

## Docker services
Initial services:
```text
frontend
backend
postgres
```
Backend gets GPU access. Do not split detector/tracker into microservices.
