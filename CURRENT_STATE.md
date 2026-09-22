# ExamGuard Current State

Updated: 2026-09-21

## Checkpoint

- Greenfield baseline starts at `e6870d2`; `0805e64` preserves the reusable CUDA environment while removing inherited legacy application files.
- PostgreSQL uses the single `20260920_0001_initial_schema` migration and the approved domain tables only.
- Docker Compose, CUDA/PyTorch, NVIDIA runtime, FFmpeg, PostgreSQL volume, media storage, YOLO11n and ByteTrack infrastructure remain unchanged.
- Phase 5.5 does not add TSM, action recognition, fabricated events, or new AI behavior.

## Phase 5.5 UX Audit

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
- Backend mypy passes for 74 source files in the Python 3.11 container environment.
- The 18 targeted monitoring tests pass. The full backend suite has one pre-existing,
  unrelated Compose-environment failure in (60 passed, 1 skipped, 1 failed)
  `tests/test_settings.py::test_old_secret_key_alias_is_not_accepted`; all other tests
  pass.
- No database volume reset or environment-file change was performed.

## Tracking Validation and Benchmark Gate

```text
TRACKING STATUS: NOT PASSED
```

- Runtime correctness passes: one runtime/worker/tracker, ordered tracker input,
  latest-frame queue size 1, bounded lag, correct pause/resume, clean seek generation,
  stale WebSocket rejection, one Canvas state, and deterministic cleanup.
- The final balanced profile uses YOLO `conf=0.10`, `iou=0.50`, `classes=[0]`,
  `max_det=64`; ByteTrack uses new-track `0.50` and buffer 30.
- Three independent 60-second videos were evaluated. Three other uploads were exact
  SHA-256 duplicates and were excluded from the mini validation set.
- Nine manually reviewed timestamps contain 60 visible-person observations: recall
  59/60 (98.3%), six duplicate-person observations (10.0%), no isolated non-person
  false track, and mean active-count error 0.78.
- Clip A still produces up to 10 tracks for 7 people because YOLO emits partial and
  full-body person boxes with IoU below the NMS threshold. Clip B misses one partially
  occluded rear person at a reviewed timestamp.
- Final CPU realtime probe: target 12.5 FPS, actual 12.45 FPS, lag mean/P95/max
  36.2/62/155 ms, queue peak 1, and clean stop.
- NVIDIA host-driver access remains unavailable. GPU/VRAM and browser-to-CUDA
  validation are not claimed.
- Supervisor-walk and complete stand/sit source clips are not available in the current
  independent uploads and remain coverage blockers.
- Full evidence, ablations, metrics, commands, and blockers are in
  `docs/TRACKING_VALIDATION_REPORT.md`.

## Next Boundary

Stop after the Tracking Validation and Benchmark Gate. Do not begin Seat Assignment, candidate
mapping, ROI, TSM/action recognition, or fabricate event, evidence, report, or appeal data.
