from __future__ import annotations

import argparse
import csv
import json
import logging
import statistics
import threading
import time
import uuid
from collections import Counter
from pathlib import Path
from typing import Any

import yaml  # type: ignore[import-untyped]

from app.ai.detector.yolo import PersonDetector
from app.ai.domain import suspicious_detection_overlaps
from app.ai.tracker.bytetrack import ByteTrackAdapter
from app.monitoring.config import load_runtime_profile_from_paths
from app.monitoring.decoder import VideoDecoder
from app.monitoring.metrics import read_system_metrics
from app.monitoring.worker import VideoAnalysisWorker

logger = logging.getLogger(__name__)


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * percentile)))
    return ordered[index]


def _latency_summary(values: list[float]) -> dict[str, float | None]:
    return {
        "average": statistics.fmean(values) if values else None,
        "p95": _percentile(values, 0.95),
        "maximum": max(values, default=None),
    }


def _run_realtime_probe(
    *,
    video: Path,
    profile: Any,
    start_ms: int,
    duration_seconds: float,
) -> dict[str, Any]:
    messages: list[dict[str, Any]] = []
    errors: list[str] = []
    ready = threading.Event()
    worker = VideoAnalysisWorker(
        session_id=uuid.uuid4(),
        video_path=video,
        profile=profile,
        start_timestamp_ms=start_ms,
        publish=messages.append,
        on_ready=ready.set,
        on_complete=lambda: None,
        on_error=errors.append,
    )
    worker.start()
    if not ready.wait(15):
        worker.stop()
        return {"error": "Runtime did not become ready within 15 seconds"}
    probe_started = time.monotonic()
    deadline = probe_started + duration_seconds
    while time.monotonic() < deadline and worker.alive and not errors:
        time.sleep(min(0.1, max(0.0, deadline - time.monotonic())))
    elapsed = max(time.monotonic() - probe_started, 1e-9)
    clean_stop = worker.stop()
    tracking = [item for item in messages if item.get("type") == "tracking"]
    diagnostics = [item for item in messages if item.get("type") == "diagnostics"]
    lag_values = [float(item["analysis_lag_ms"]) for item in diagnostics]
    return {
        "duration_seconds": elapsed,
        "clean_stop": clean_stop,
        "errors": errors,
        "tracking_frames": len(tracking),
        "actual_analysis_fps": len(tracking) / elapsed,
        "analysis_lag_ms": _latency_summary(lag_values),
        "maximum_queue_size": max((int(item["queue_size"]) for item in diagnostics), default=0),
        "dropped_analysis_frames": worker.dropped_analysis_frames,
        "runtime_instance_id": str(worker.runtime_instance_id),
        "runtime_generation": worker.runtime_generation,
    }


def run_benchmark(args: argparse.Namespace) -> dict[str, Any]:
    profile = load_runtime_profile_from_paths(
        config_root=args.config_root,
        model_root=args.model_root,
        profile_name=args.profile,
    )
    if args.device is not None and args.device != profile.detector.device:
        logger.warning(
            "Explicit benchmark device override profile_device=%s benchmark_device=%s",
            profile.detector.device,
            args.device,
        )
        profile = profile.model_copy(
            update={
                "device": args.device,
                "detector": profile.detector.model_copy(
                    update={"device": args.device, "half": args.device.startswith("cuda")}
                ),
            }
        )
    if args.detector_iou is not None:
        logger.warning("Explicit benchmark detector override iou=%s", args.detector_iou)
        profile.detector = profile.detector.model_copy(update={"iou": args.detector_iou})
    if args.disable_duplicate_suppression:
        logger.warning("Duplicate suppression disabled for benchmark ablation")
        profile.detector = profile.detector.model_copy(
            update={
                "duplicate_suppression": profile.detector.duplicate_suppression.model_copy(
                    update={"enabled": False}
                )
            }
        )
    if args.new_track_thresh is not None:
        logger.warning(
            "Explicit benchmark tracker override new_track_thresh=%s",
            args.new_track_thresh,
        )
        profile.tracker = profile.tracker.model_copy(
            update={"new_track_thresh": args.new_track_thresh}
        )
    if args.match_thresh is not None:
        logger.warning("Explicit benchmark tracker override match_thresh=%s", args.match_thresh)
        profile.tracker = profile.tracker.model_copy(update={"match_thresh": args.match_thresh})
    if args.track_low_thresh is not None:
        logger.warning(
            "Explicit benchmark tracker override track_low_thresh=%s",
            args.track_low_thresh,
        )
        profile.tracker = profile.tracker.model_copy(
            update={"track_low_thresh": args.track_low_thresh}
        )
    if args.track_buffer is not None:
        logger.warning("Explicit benchmark tracker override track_buffer=%s", args.track_buffer)
        profile.tracker = profile.tracker.model_copy(update={"track_buffer": args.track_buffer})

    detector = PersonDetector(profile.detector)
    tracker = ByteTrackAdapter(profile.tracker)
    decoder = VideoDecoder(args.video)
    interval_ms = 1000.0 / profile.analysis.target_fps
    start_ms = max(0, args.start_ms)
    end_ms = start_ms + round(args.duration_seconds * 1000)
    decoder.seek(start_ms)

    detector_latencies: list[float] = []
    tracker_latencies: list[float] = []
    pipeline_latencies: list[float] = []
    rows: list[dict[str, Any]] = []
    lifecycle_counts: Counter[str] = Counter()
    track_lifetimes: dict[int, list[int]] = {}
    total_detections = 0
    total_raw_detections = 0
    total_suppressed_detections = 0
    peak_simultaneous_tracks = 0
    suspicious_overlap_count = 0
    gpu_util_samples: list[float] = []
    vram_samples: list[float] = []
    cpu_util_samples: list[float] = []
    ram_used_samples: list[float] = []
    next_metrics_at = 0.0
    target_ms = float(start_ms)
    wall_started = time.perf_counter()

    try:
        while target_ms <= end_ms:
            packet, _ = decoder.read_for_timestamp(round(target_ms), 0)
            if packet is None:
                break
            pipeline_started = time.perf_counter()
            detector_started = time.perf_counter()
            detections = detector.detect(packet.frame)
            raw_detection_count = detector.last_raw_detection_count
            suppressed_detection_count = detector.last_suppressed_detection_count
            detector_ms = (time.perf_counter() - detector_started) * 1000
            tracker_started = time.perf_counter()
            tracks = tracker.update(detections, packet.frame.shape[:2], packet.timestamp_ms)
            tracker_ms = (time.perf_counter() - tracker_started) * 1000
            pipeline_ms = (time.perf_counter() - pipeline_started) * 1000
            overlaps = suspicious_detection_overlaps(
                detections,
                profile.tracking_debug.suspicious_iou_threshold,
            )

            detector_latencies.append(detector_ms)
            tracker_latencies.append(tracker_ms)
            pipeline_latencies.append(pipeline_ms)
            total_detections += len(detections)
            total_raw_detections += raw_detection_count
            total_suppressed_detections += suppressed_detection_count
            peak_simultaneous_tracks = max(peak_simultaneous_tracks, len(tracks))
            suspicious_overlap_count += len(overlaps)
            for event in tracker.drain_lifecycle_events():
                lifecycle_counts[event.event] += 1
            for track in tracks:
                lifetime = track_lifetimes.setdefault(
                    track.track_id,
                    [packet.timestamp_ms, packet.timestamp_ms],
                )
                lifetime[1] = packet.timestamp_ms

            rows.append(
                {
                    "timestamp_ms": packet.timestamp_ms,
                    "frame_id": packet.frame_id,
                    "detection_count": len(detections),
                    "raw_detection_count": raw_detection_count,
                    "suppressed_detection_count": suppressed_detection_count,
                    "active_track_count": len(tracks),
                    "track_ids": " ".join(str(track.track_id) for track in tracks),
                    "track_boxes": json.dumps(
                        [
                            {
                                "track_id": track.track_id,
                                "bbox": [round(value, 2) for value in track.bbox_xyxy],
                                "confidence": round(track.confidence, 4),
                            }
                            for track in tracks
                        ],
                        separators=(",", ":"),
                    ),
                    "detection_boxes": json.dumps(
                        [
                            {
                                "bbox": [round(value, 2) for value in detection.bbox_xyxy],
                                "confidence": round(detection.confidence, 4),
                                "class_id": detection.class_id,
                            }
                            for detection in detections
                        ],
                        separators=(",", ":"),
                    ),
                    "suspicious_overlaps": json.dumps(overlaps, separators=(",", ":")),
                    "detector_ms": round(detector_ms, 4),
                    "tracker_ms": round(tracker_ms, 4),
                    "pipeline_ms": round(pipeline_ms, 4),
                    "analysis_lag_ms": "",
                }
            )
            now = time.monotonic()
            if now >= next_metrics_at:
                system = read_system_metrics()
                if system.gpu_util_pct is not None:
                    gpu_util_samples.append(system.gpu_util_pct)
                if system.vram_used_mb is not None:
                    vram_samples.append(system.vram_used_mb)
                if system.cpu_util_pct is not None:
                    cpu_util_samples.append(system.cpu_util_pct)
                if system.ram_used_mb is not None:
                    ram_used_samples.append(system.ram_used_mb)
                next_metrics_at = now + 1.0
            target_ms += interval_ms
    finally:
        decoder.release()

    wall_seconds = max(time.perf_counter() - wall_started, 1e-9)
    lifetimes_ms = [last - first for first, last in track_lifetimes.values()]
    evaluated_ms = rows[-1]["timestamp_ms"] - rows[0]["timestamp_ms"] if len(rows) > 1 else 0
    report: dict[str, Any] = {
        "video": str(args.video),
        "profile": profile.profile,
        "device": profile.detector.device,
        "detector_config": profile.detector.model_dump(mode="json"),
        "tracker_config": profile.tracker.model_dump(mode="json"),
        "video_duration_evaluated_ms": evaluated_ms,
        "source_fps": decoder.source_fps,
        "target_analysis_fps": profile.analysis.target_fps,
        "actual_analysis_fps": len(rows) / wall_seconds,
        "frames_analyzed": len(rows),
        "latency_ms": {
            "detector": _latency_summary(detector_latencies[1:]),
            "tracker": _latency_summary(tracker_latencies[1:]),
            "pipeline": _latency_summary(pipeline_latencies[1:]),
        },
        "first_frame_latency_ms": {
            "detector": detector_latencies[0] if detector_latencies else None,
            "tracker": tracker_latencies[0] if tracker_latencies else None,
            "pipeline": pipeline_latencies[0] if pipeline_latencies else None,
        },
        "number_of_detections": total_detections,
        "number_of_raw_detections": total_raw_detections,
        "number_of_suppressed_detections": total_suppressed_detections,
        "number_of_created_tracks": lifecycle_counts["TRACK_CREATED"],
        "peak_simultaneous_tracks": peak_simultaneous_tracks,
        "track_lifetime_ms": {
            "minimum": min(lifetimes_ms, default=None),
            "median": statistics.median(lifetimes_ms) if lifetimes_ms else None,
            "p95": _percentile([float(value) for value in lifetimes_ms], 0.95),
            "maximum": max(lifetimes_ms, default=None),
        },
        "track_lifecycle": dict(sorted(lifecycle_counts.items())),
        "raw_suspicious_overlap_pairs": suspicious_overlap_count,
        "gpu": {
            "average_util_pct": statistics.fmean(gpu_util_samples) if gpu_util_samples else None,
            "peak_vram_used_mb": max(vram_samples, default=None),
        },
        "system": {
            "average_cpu_util_pct": (
                statistics.fmean(cpu_util_samples) if cpu_util_samples else None
            ),
            "average_ram_used_mb": (
                statistics.fmean(ram_used_samples) if ram_used_samples else None
            ),
            "peak_ram_used_mb": max(ram_used_samples, default=None),
        },
        "quality_metrics": "Manual review required; no ground-truth MOT metrics are claimed.",
    }
    if args.csv is not None:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with args.csv.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else [])
            if rows:
                writer.writeheader()
                writer.writerows(rows)
        report["manual_review_csv"] = str(args.csv)
    if args.realtime_seconds is not None:
        report["realtime_probe"] = _run_realtime_probe(
            video=args.video,
            profile=profile,
            start_ms=start_ms,
            duration_seconds=args.realtime_seconds,
        )
    if args.output is not None:
        output = args.output
        output.mkdir(parents=True, exist_ok=True)
        csv_path = output / "frames_or_tracks.csv"
        with csv_path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else [])
            if rows:
                writer.writeheader()
                writer.writerows(rows)
        config_path = output / "config_snapshot.yaml"
        config_path.write_text(
            yaml.safe_dump(
                {
                    "profile": profile.model_dump(mode="json"),
                    "benchmark": {
                        "video": str(args.video),
                        "start_ms": start_ms,
                        "duration_seconds": args.duration_seconds,
                        "realtime_seconds": args.realtime_seconds,
                        "device_override": args.device,
                    },
                },
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        report["artifacts"] = {
            "summary": str(output / "summary.json"),
            "frames_or_tracks": str(csv_path),
            "config_snapshot": str(config_path),
        }
        (output / "summary.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark YOLO11n + ByteTrack on a real video")
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--profile", choices=("gtx1650", "rtx3060"), default="gtx1650")
    parser.add_argument("--config-root", type=Path, default=Path("/app/configs"))
    parser.add_argument("--model-root", type=Path, default=Path("/models"))
    parser.add_argument("--start-ms", type=int, default=0)
    parser.add_argument("--duration-seconds", type=float, default=30.0)
    parser.add_argument("--device", help="Explicit benchmark-only device override, for example cpu")
    parser.add_argument("--detector-iou", type=float, help="Single-variable YOLO NMS IoU ablation")
    parser.add_argument(
        "--disable-duplicate-suppression",
        action="store_true",
        help="Disable nested-box suppression for an A/B benchmark",
    )
    parser.add_argument("--new-track-thresh", type=float, help="Single-variable ByteTrack ablation")
    parser.add_argument(
        "--match-thresh",
        type=float,
        help="Single-variable ByteTrack match ablation",
    )
    parser.add_argument("--track-low-thresh", type=float, help="Single-variable low-score ablation")
    parser.add_argument(
        "--track-buffer",
        type=int,
        help="Single-variable lost-track buffer ablation",
    )
    parser.add_argument("--csv", type=Path, help="Optional per-frame CSV for manual review")
    parser.add_argument(
        "--output",
        type=Path,
        help="Write summary.json, frames_or_tracks.csv and config_snapshot.yaml",
    )
    parser.add_argument(
        "--realtime-seconds",
        type=float,
        help="Optional wall-clock runtime probe using latest-frame scheduling",
    )
    return parser


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = build_parser().parse_args()
    if args.start_ms < 0 or args.duration_seconds <= 0:
        raise SystemExit("--start-ms must be >= 0 and --duration-seconds must be > 0")
    if args.new_track_thresh is not None and not 0 <= args.new_track_thresh <= 1:
        raise SystemExit("--new-track-thresh must be between 0 and 1")
    if args.detector_iou is not None and not 0 <= args.detector_iou <= 1:
        raise SystemExit("--detector-iou must be between 0 and 1")
    if args.match_thresh is not None and not 0 <= args.match_thresh <= 1:
        raise SystemExit("--match-thresh must be between 0 and 1")
    if args.track_low_thresh is not None and not 0 <= args.track_low_thresh <= 1:
        raise SystemExit("--track-low-thresh must be between 0 and 1")
    if args.track_buffer is not None and args.track_buffer <= 0:
        raise SystemExit("--track-buffer must be > 0")
    if args.realtime_seconds is not None and args.realtime_seconds <= 0:
        raise SystemExit("--realtime-seconds must be > 0")
    print(json.dumps(run_benchmark(args), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
