# Tracking Validation and Benchmark Report

Updated: 2026-09-21

## Gate Decision

```text
TRACKING STATUS: NOT PASSED
```

Runtime, ordering, WebSocket, Canvas, cleanup, and bounded-latency requirements
pass. Real-video tracking quality does not pass: the difficult adjacent-person
clip has a 10% duplicate-person observation rate in the manually reviewed
subset, and a partially occluded rear person is missed in another clip.

## Current Configuration

YOLO11n:

```yaml
imgsz: 640
classes: [0]
conf: 0.10
iou: 0.50
max_det: 64
device: cuda:0
half: true
```

ByteTrack GTX1650:

```yaml
tracker_type: bytetrack
track_high_thresh: 0.25
track_low_thresh: 0.10
new_track_thresh: 0.50
track_buffer: 30
match_thresh: 0.80
fuse_score: true
```

The product profile remains CUDA-only. CPU was an explicit benchmark override
because the host NVIDIA driver was unavailable.

## Runtime Verification

- The system instantiates `PersonDetector` once and a direct Ultralytics
  `BYTETracker` once per `VideoAnalysisWorker`.
- `model.track()` is not used, so `persist=True` is not applicable. Persistence
  comes from retaining the same `BYTETracker` object for the generation.
- Duplicate start is rejected. Runtime, worker, and tracker UUIDs remain stable
  during normal playback.
- Pause/resume preserves the tracker. Seek advances generation, clears pending
  work, resets ByteTrack, and restarts sequence numbering.
- Tracker input now requires strictly increasing timestamps. Non-increasing
  packets in one generation are dropped before detector/tracker invocation.
- The one-slot buffer replaces stale work. Realtime queue peak was 1 and lag
  stayed bounded.
- WebSocket messages carry runtime instance, generation, tracker instance, and
  monotonic per-generation sequence. The frontend rejects stale/duplicate state.
- Canvas renders only one nearest `TrackingFrame`, clears the full DPR backing
  store, and owns one cleaned-up render loop. Diagnostics are development-only.

## Validation Set

The manifest is `docs/tracking_validation/manifest.yaml`; manual references are
in `docs/tracking_validation/manual_annotations.csv`.

Three independent 60-second, 1920x1080, 25 FPS sources were used. Three other
uploads were excluded because their SHA-256 matched clip B exactly.

| Clip | People | Coverage | Final peak tracks |
|---|---:|---|---:|
| A | 7 | seated, posture, adjacent, partial occlusion | 10 |
| B | 7 | seated, posture, adjacent, partial occlusion | 7 |
| C | 6 | stable seated, posture, adjacent | 6 |

No independent source contained a supervisor walking through the room or a full
stand-move-sit sequence. Those scenarios remain validation blockers.

## Manual Quality Metrics

Nine timestamps produced 60 visible-person observations:

```text
person recall: 59 / 60 = 98.3%
isolated non-person false tracks: 0
extra duplicate tracks: 6
duplicate-person observation rate: 6 / 60 = 10.0%
mean active-track count error: 7 / 9 = 0.78
maximum active-track count error: 3
confirmed clear-person ID switches: 0 in the sparse reviewed timestamps
confirmed fragmentation: 1 partially occluded rear person lost between 30s and 45s
```

The zero ID-switch count is limited to the sparse manually reviewed timestamps;
it is not a universal claim. Final 60-second lifetime summaries were:

| Clip | Created tracks | Lifetime min / median / P95 / max (ms) |
|---|---:|---|
| A | 10 | 21,520 / 55,160 / 60,000 / 60,000 |
| B | 11 | 480 / 59,840 / 60,000 / 60,000 |
| C | 6 | 49,120 / 60,000 / 60,000 / 60,000 |

## Root Causes

### Duplicate partial and full-body tracks

**Symptom:** Clip A has 8-10 active tracks for 7 people.

**Root cause:** Raw YOLO output contains 11-13 person boxes at the failure
timestamps. Several are partial/full-body boxes for the same person with mutual
IoU below 0.50, so standard IoU NMS does not remove them. Some cross the new-track
threshold and become simultaneous ByteTrack tracks.

**Evidence:** At 28.32s, 7 people produce 13 detections and 10 active tracks. The
annotated artifact shows three duplicated people. The WebSocket payload contains
the same 10 tracks and Canvas draws only that one state, excluding a frontend
duplication cause.

**Fix attempted:** Controlled NMS IoU and `new_track_thresh` ablations. No custom
containment suppression was added because it could remove a genuinely distinct,
partially occluded adjacent person.

**Regression coverage:** Raw detection/tracked boxes and classes are exported;
person-only config and single-inference/runtime behavior are tested.

**Post-fix result:** Improved from baseline peak 14 to peak 10, but still fails.

### Partial-occlusion miss

**Symptom:** Clip B has 6 tracks for 7 visible people at 44.96s.

**Root cause:** The rear person is visible only as a low-confidence partial box.
Raising `new_track_thresh` prevents duplicate starts but also prevents this person
from establishing/re-establishing a track.

**Evidence:** The artifact shows a `0.25` rear-person detection without an active
track. Raising `new_track_thresh` to 0.60 reduced duplicates but left only 4-6
tracks for long portions of clips A/B.

**Fix attempted:** Values 0.50, 0.55, and 0.60 were compared while retaining
`conf=0.10` for association.

**Regression coverage:** Lifecycle logs and CSV make loss/recreation measurable.

**Post-fix result:** The balanced 0.50 value retains better recall, but the miss
remains and the gate fails.

### Pause/resume, stale runtime, and renderer risks

The earlier lifecycle defects remain fixed: resume no longer seeks, late worker
callbacks are runtime-UUID guarded, generation/sequence rejects stale messages,
and Canvas/render/WebSocket cleanup is deterministic. Regression tests pass.

## Ablation Record

Representative 60-second clip B unless noted:

| Experiment | Created / peak | Result |
|---|---:|---|
| Baseline IoU .70, new .25, buffer 30 | 23 / 11 | Failed |
| Buffer 20 only | 26 / 11 | More fragmentation; rejected |
| New .50 only | 12 / 8 | Improved duplicate creation |
| IoU .50 only | 17 / 9 | Removed IoU>=.50 overlaps, still duplicates |
| IoU .50 + new .50 | 11 / 7 | Balanced candidate |
| IoU .35 + new .50, clip A | 12 / 8, 66 LOST | Rejected |
| IoU .50 + new .55, clip A | 10 / 9 | Still duplicates |
| IoU .50 + new .60, clip A | 9 / 7 | Recall too low; rejected |

## Performance

Across the final 180-second set (2,253 frames; first lazy frame per source
excluded from steady-state latency):

```text
detector: mean 17.8065 ms, P95 20.5227 ms
tracker: mean 0.8471 ms, P95 1.0923 ms
pipeline: mean 18.6551 ms, P95 21.3880 ms
```

Final 20-second realtime CPU probe:

```text
target analysis FPS: 12.5
actual analysis FPS: 12.45
analysis lag mean / P95 / max: 36.2 / 62 / 155 ms
dropped analysis frames: 252
maximum queue size: 1
clean stop: true
runtime errors: none
```

Drops include intentional 25-to-12.5 FPS sampling. GPU utilization and VRAM are
unavailable because `nvidia-smi` cannot communicate with the host driver.

## Artifacts

Benchmark outputs are under `/tmp/examguard-tracking/validation/`. Each benchmark
directory contains `summary.json`, `frames_or_tracks.csv`, and
`config_snapshot.yaml`. Important images include:

```text
candidate-6627/error-duplicate-28320.jpg
candidate-6627/recovered-count-60000.jpg
candidate-8eaf/error-missed-44960.jpg
candidate-a456/stable-30000.jpg
```

CLI usage:

```bash
python -m app.cli.benchmark_tracking --video /data/test.mp4 \
  --profile gtx1650 --output /data/tracking_eval/results

python -m app.cli.render_tracking_artifact --video /data/test.mp4 \
  --csv /data/tracking_eval/results/frames_or_tracks.csv \
  --timestamp-ms 28320 --output /data/tracking_eval/results/failure.jpg
```

The gate executed 900 seconds of offline real-video analysis plus a 20-second
realtime probe. This includes repeated ablations over three unique 60-second
segments; the unique validation content duration is 180 seconds.

## Verification and Scope

```text
targeted tracking pytest: 18 passed
full backend pytest: 60 passed, 1 skipped, 1 unrelated settings failure
Ruff check: passed
Ruff format check for tracking scope: 26 files formatted
mypy: passed, 75 source files
frontend Vitest: 4 files, 13 tests passed
frontend typecheck and production build: passed
```

The unrelated full-suite failure is
`tests/test_settings.py::test_old_secret_key_alias_is_not_accepted`, caused by
the Compose environment providing the current JWT secret.

No database migration or tracking table was added. No Seat Assignment,
Track-to-Seat, Candidate mapping, ROI, TSM/X3D, action recognition, Event,
Evidence, Appeal, or Report functionality was added.

## Remaining Blockers

1. Resolve partial/full-body duplicate detections on adjacent seated people
   without suppressing true partially occluded neighbors.
2. Restore reliable partial-occlusion track initialization/recovery without
   returning to continuous duplicate IDs.
3. Add independent supervisor-walk and stand/sit clips to the validation set.
4. Re-run performance and browser-to-CUDA validation after the NVIDIA driver is
   available.

