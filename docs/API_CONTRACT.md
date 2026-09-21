# ExamGuard — API Contract

Prefix: `/api/v1`

## Auth
```text
POST /api/v1/auth/login
GET  /api/v1/auth/me
```

## Rooms
```text
GET   /api/v1/rooms
POST  /api/v1/rooms
GET   /api/v1/rooms/{room_id}
PATCH /api/v1/rooms/{room_id}
```

## Seats
```text
GET /api/v1/rooms/{room_id}/seats
PUT /api/v1/rooms/{room_id}/seats
```
PUT validates unique codes and normalized geometry.

## Candidates
```text
GET   /api/v1/candidates?q=...
POST  /api/v1/candidates
GET   /api/v1/candidates/{candidate_id}
PATCH /api/v1/candidates/{candidate_id}
GET   /api/v1/candidates/{candidate_id}/sessions
GET   /api/v1/candidates/{candidate_id}/events
```

## Media
```text
POST /api/v1/media/videos
GET  /api/v1/media/{media_id}
GET  /api/v1/media/{media_id}/content
```
Upload response should include filename, media URL, width, height, FPS, duration, codec and size. Media endpoint should support browser seeking/range requests when feasible.

## Sessions
```text
GET   /api/v1/sessions
POST  /api/v1/sessions
GET   /api/v1/sessions/{session_id}
PATCH /api/v1/sessions/{session_id}
PUT   /api/v1/sessions/{session_id}/candidates
```
Candidate assignment must reject duplicate candidates/seats and seats from another room.

## Monitoring lifecycle
```text
POST /api/v1/sessions/{session_id}/start
POST /api/v1/sessions/{session_id}/pause
POST /api/v1/sessions/{session_id}/resume
POST /api/v1/sessions/{session_id}/stop
POST /api/v1/sessions/{session_id}/seek
GET  /api/v1/sessions/{session_id}/monitoring-status
```
Seek request:
```json
{"timestamp_ms": 53240}
```

## WebSocket
```text
/ws/monitoring/{session_id}
```
Tracking message:
```json
{
  "type": "tracking",
  "session_id": "uuid",
  "timestamp_ms": 53240,
  "frame_id": 1331,
  "source_width": 1920,
  "source_height": 1080,
  "tracks": [
    {"track_id": 17, "bbox_norm": [0.214,0.182,0.326,0.784], "confidence": 0.91}
  ]
}
```
Diagnostics message includes analysis_fps, detector_ms, tracker_ms, pipeline_ms, gpu_util_pct, vram_used_mb, cpu_util_pct, ram_used_mb and dropped_analysis_frames.

## Manual events
```text
POST /api/v1/events/manual
```
Request may include session_id, timestamp_ms, optional behavior_type and optional session_candidate_ids.

## Events
```text
GET /api/v1/events
GET /api/v1/events/{event_id}
POST /api/v1/events/{event_id}/reviews
```
Filters: session, candidate, status, behavior, date.

## Evidence
```text
GET  /api/v1/events/{event_id}/evidence
POST /api/v1/events/{event_id}/evidence/lock
POST /api/v1/events/{event_id}/evidence/unlock
```

## Appeals
```text
POST  /api/v1/appeals
GET   /api/v1/appeals/{appeal_id}
PATCH /api/v1/appeals/{appeal_id}
```

## Search later
```text
GET /api/v1/search?q=SV103
```
Return typed results for candidate/session/event.
