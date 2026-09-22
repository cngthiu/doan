# ExamGuard Current State

Updated: 2026-09-22

## Checkpoint

- Greenfield baseline starts at `e6870d2`; `0805e64` preserves the reusable CUDA environment while removing inherited legacy application files.
- PostgreSQL uses the single `20260920_0001_initial_schema` migration and the approved domain tables only.
- Docker Compose, CUDA/PyTorch, NVIDIA runtime, FFmpeg, PostgreSQL volume, media storage, YOLO11n and ByteTrack infrastructure remain unchanged.
- Phase 5.5 does not add TSM, action recognition, fabricated events, or new AI behavior.

## Phase 5.5 UX Audit

The operator UI now uses an AdminLTE-inspired application shell: a dark responsive
sidebar, compact top navigation, content header, white cards/tables/forms, status
accents, mobile sidebar backdrop, and a matching login card. Existing routes,
permissions, validation, and monitoring behavior are unchanged.

| Page | CRUD / validation | Loading / empty / error | Phase 5.5 result |
|---|---|---|---|
| Login | Login with normalized username and field validation | Submit and connection errors | Vietnamese field-level validation and duplicate-submit protection |
| Monitoring | Select and operate a ready session | Explicit loading, empty, retryable error | Vietnamese UI, bounded search, real readiness panel, stop confirmation |
| Rooms | Create, read, update, deactivate/reactivate | Loading, empty, retryable error | Pagination, debounced search, field errors, confirmation and toast |
| Seat layout | Create, update and soft-deactivate omitted seats | Empty, error and saving states | Local validation, dirty protection, removal consequence and toast |
| Candidates | Create, read, update and search; no destructive delete | Loading, empty, retryable error | Pagination, debounced search, field errors and toast |
| Sessions | Create, read, search/filter and retain history | Loading, empty, retryable error | Pagination, localized status, validation and consistent date display |
| Session detail | Editable before monitoring; cancel and preserve history | Loading, empty, retryable error | Pre-flight checks, metadata edit, dirty assignment protection and confirmations |
| Navigation/settings | Existing roles only | Honest unavailable states | Role-oriented Vietnamese navigation and localized role names |

## Contracts

- Rooms, candidates and sessions use `{items, page, page_size, total}` list responses.
- List endpoints accept `page`, `page_size` and `q`; sessions also accept `status`.
- API errors keep English machine codes and messages, add an optional `field`, and are mapped to Vietnamese in the frontend.
- Frontend input validation improves UX; Pydantic, services and PostgreSQL remain authoritative.
- Session edits and assignment changes are rejected after monitoring starts. Pre-start cancellation is append-only audited as `SESSION_CANCELLED`.
- Existing seat rows omitted from a saved layout are deactivated, not hard deleted.

## Verification

- Frontend unit tests, TypeScript checks and production build pass.
- Backend Ruff passes.
- Alembic remains at the single initial-schema head; Phase 5.5 requires no schema migration.
- Backend mypy passes for 75 source files.
- The 20 targeted detector/tracker/runtime tests pass. The full backend suite was
  not completed in this host environment: the Docker daemon is unavailable and
  the temporary host CPython build lacks its native SQLite module.
- No database volume reset or environment-file change was performed.

## Tracking Validation and Benchmark Gate

```text
TRACKING STATUS: PASSED ON THE AVAILABLE MINI VALIDATION SET
```

- Runtime correctness passes: one runtime/worker/tracker, ordered tracker input,
  latest-frame queue size 1, bounded lag, correct pause/resume, clean seek generation,
  stale WebSocket rejection, one Canvas state, and deterministic cleanup.
- The final balanced profile uses YOLO `conf=0.10`, `iou=0.50`, `classes=[0]`,
  `max_det=64` plus conservative nested partial/full-body suppression; ByteTrack
  uses new-track `0.40` and buffer 30.
- Three independent 60-second videos were evaluated. Three other uploads were exact
  SHA-256 duplicates and were excluded from the mini validation set.
- Nine manually reviewed timestamps contain 60 visible-person observations: recall
  60/60, zero duplicate-person observations, no isolated non-person false track,
  and zero active-count error at the reviewed timestamps.
- Across all 2,253 analyzed frames, no clip exceeds its reference person count;
  the mean absolute active-count error is 0.424. This all-frame number uses a
  constant per-clip visible-person reference and is not a formal MOT metric.
- Track fragmentation during long/partial occlusion remains: 34 track IDs are
  created for 20 people across the three clips. Track ID remains runtime-only and
  must not be used as permanent candidate identity.
- Final CPU realtime probe: target 12.5 FPS, actual 12.50 FPS, lag mean/P95/max
  23.53/27/111 ms, queue peak 1, and clean stop.
- NVIDIA host-driver access remains unavailable. GPU/VRAM and browser-to-CUDA
  validation are not claimed.
- Supervisor-walk and complete stand/sit source clips are not available in the current
  independent uploads and remain coverage gaps, so this is not a universal accuracy
  claim.
- Full evidence, ablations, metrics, commands, and blockers are in
  `docs/TRACKING_VALIDATION_REPORT.md`.

## Next Boundary

Stop after the Tracking Validation and Benchmark Gate. Do not begin Seat Assignment, candidate
mapping, ROI, TSM/action recognition, or fabricate event, evidence, report, or appeal data.
