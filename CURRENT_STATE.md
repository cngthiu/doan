# ExamGuard Current State

Updated: 2026-09-22

## Checkpoint

- Greenfield baseline starts at `e6870d2`; `0805e64` preserves the reusable CUDA environment while removing inherited legacy application files.
- PostgreSQL uses the single `20260920_0001_initial_schema` migration and the approved domain tables only.
- Docker Compose, CUDA/PyTorch, NVIDIA runtime, FFmpeg, PostgreSQL volume, media storage, YOLO11n and ByteTrack infrastructure remain unchanged.
- Seat-Stable Identity adds runtime Track → Seat → SessionCandidate → Candidate resolution.
  It does not add TSM, action recognition, Proposal Builder, fabricated events, or evidence.

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
- Backend mypy passed for the 76 source files present before the RBAC user-management
  additions; the expanded backend still requires a fresh container mypy run.
- The 20 targeted detector/tracker/runtime tests from the prior tracking gate pass.
  The full backend suite has not been rerun for the expanded RBAC tree because
  volume-backed Docker execution is blocked by the current approval service.
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

## RBAC

```text
RBAC STATUS: NOT PASSED
RBAC UI STATUS: PASSED
RBAC USER MANAGEMENT: IMPLEMENTED, BACKEND TEST EXECUTION PENDING
```

- Fixed permissions are centralized for the existing `ADMIN`, `SUPERVISOR`, and
  `REVIEWER` roles. No role/permission tables or database migration were added.
- All implemented room, candidate, session, media, monitoring, and tracking
  WebSocket routes now enforce named permissions after authentication.
- The backend returns `403` with code `FORBIDDEN` for authenticated users who
  lack a required permission. Inactive-user and existing business-state checks
  remain authoritative.
- Frontend routes, role landing pages, sidebar navigation, editing controls,
  media upload, monitoring controls, and development diagnostics use the
  centralized permission map. Forbidden direct routes show an explicit
  Vietnamese `403` state without redirecting an authenticated user to Login.
- The ADMIN landing page has a compact operational overview backed by real
  session and active-user counts. SUPERVISOR lands on Monitoring; REVIEWER lands
  on the implemented read-only Sessions page because Event Review is not yet present.
- Navigation exposes only implemented routes. The top navbar localizes the role
  and provides account details plus logout without exposing raw permissions.
- ADMIN now has `Cài đặt → Người dùng` backed by real `/api/v1/users` endpoints:
  paginated search/filter, account creation, full-name/role editing, deactivation,
  and reactivation. Passwords require at least 12 characters with a letter and a
  number, are hashed immediately, and are never returned by the API.
- Role/status changes take effect on the next authenticated request because the
  backend resolves the current user from PostgreSQL for every request. Self role
  changes, self deactivation, and removal of the last active ADMIN are rejected.
- User creation, profile changes, role changes, deactivation, and reactivation
  append dedicated audit records. ADMIN has a read-only `Nhật ký hệ thống` page
  backed by `/api/v1/audit-logs`; other roles cannot access either admin route.
- Supervisor candidate management now matches the RBAC specification;
  reviewers retain genuinely read-only candidate/session views and cannot
  trigger monitoring lifecycle or seek synchronization APIs.
- Page/resource `403` responses use a consistent Vietnamese content message;
  mutation `403` responses retain the action-specific message.
- Existing append-only audit calls remain in the room, candidate, session,
  assignment, media, and monitoring services. RBAC adds no per-frame or
  WebSocket-message audit records.
- Added backend permission-map and authorization regression tests. Frontend tests
  cover the permission map, role landings/navigation, direct-route authorization,
  `PermissionGate`, and the Vietnamese Forbidden page.
- Frontend verification: `npm test` passes 10 files and 27 tests; `npm run
  typecheck` passes; `npm run build` passes with 124 modules transformed; `git
  diff --check` passes. No frontend lint script is configured in `package.json`.
- Backend Ruff and format checks pass, and backend user-management/API regression
  tests were added. Fresh backend pytest and mypy execution are blocked because
  the host virtualenv targets container Python 3.11, while the Docker volume run
  requires an approval service that currently returns `MODEL_NOT_FOUND`. The
  overall RBAC status therefore remains `NOT PASSED`.
- Events/reviews, evidence, appeals, reports, and system settings do not yet
  expose application APIs in this milestone. Event/review,
  evidence, appeal, report, and system-setting navigation/pages remain omitted
  instead of fabricating data or placeholder workflows.
- No detector, tracker, scheduler, WebSocket schema, or other AI behavior was
  changed by the RBAC UI implementation.

## Next Boundary

```text
SEAT-STABLE IDENTITY: NOT PASSED
IMPLEMENTATION/UNIT/INTEGRATION GATE: PASSED
```

- Runtime identity context is loaded once at monitoring start. PostgreSQL is not queried per
  analysis frame, and no tracking/identity history table or migration was added.
- Matching uses normalized source-video coordinates, explicit overlap/distance scoring, greedy
  one-to-one assignment, temporal confirmation/release, switch hysteresis, and seat grace.
- Pause uses no wall clock. Seek resets ByteTrack and Seat Assignment in the same generation
  transition. A restarted runtime constructs fresh state.
- WebSocket tracking messages now include compact identity and seat occupancy metadata. The
  frontend joins `session_candidate_id` with the existing session REST assignments and shows
  `Seat • Candidate` instead of Track ID in normal mode.
- Seat calibration now uses an authenticated real media frame or a locally selected MP4 rather
  than a blank background. Existing H9302 seat coordinates were not automatically overwritten.
- Three real 60-second clips were evaluated at 5 FPS using production YOLO11n, ByteTrack, and
  SeatAssignmentEngine: 903 frames, 5,418 expected actor samples, 95.146% correct, 0% wrong,
  4.854% unassigned, zero false seat switches, and zero false identities across 345 extra-track
  samples. CPU seat assignment mean/P95 was 0.667/0.770 ms.
- The overall gate remains NOT PASSED because the available independent sources do not contain
  a supervisor walking through the aisle or a complete stand/leave/move sequence, and the
  persisted H9302 layout still needs operator recalibration for the selected camera view. These
  missing real-world acceptance scenarios must not be replaced by unit-test claims.
- Backend verification: 85 passed, 1 skipped (explicit CUDA-only test); Ruff passes; mypy passes
  for 91 source files. Frontend verification: 10 files/28 tests pass and production build passes.
- Full formulas, state machines, validation definitions and limitations are in
  `docs/SEAT_STABLE_IDENTITY_REPORT.md`.

Stop after Seat-Stable Identity. Do not automatically begin Proposal Builder, ROI,
TSM/action recognition, Events, Evidence, Appeals, or Reports.
