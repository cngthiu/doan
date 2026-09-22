from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class Detection:
    bbox_xyxy: tuple[float, float, float, float]
    confidence: float
    class_id: int


@dataclass(frozen=True, slots=True)
class TrackedObject:
    track_id: int
    bbox_xyxy: tuple[float, float, float, float]
    confidence: float


@dataclass(frozen=True, slots=True)
class Track:
    track_id: int
    bbox_norm: tuple[float, float, float, float]
    confidence: float


@dataclass(frozen=True, slots=True)
class TrackingFrame:
    session_id: uuid.UUID
    runtime_instance_id: uuid.UUID
    runtime_generation: int
    tracker_instance_id: uuid.UUID
    tracking_seq: int
    frame_id: int
    timestamp_ms: int
    source_width: int
    source_height: int
    tracks: tuple[Track, ...]

    def as_message(self) -> dict[str, Any]:
        return {
            "type": "tracking",
            "session_id": str(self.session_id),
            "runtime_instance_id": str(self.runtime_instance_id),
            "runtime_generation": self.runtime_generation,
            "tracker_instance_id": str(self.tracker_instance_id),
            "tracking_seq": self.tracking_seq,
            "timestamp_ms": self.timestamp_ms,
            "frame_id": self.frame_id,
            "source_width": self.source_width,
            "source_height": self.source_height,
            "tracks": [asdict(track) for track in self.tracks],
        }


@dataclass(frozen=True, slots=True)
class RuntimeDiagnostics:
    session_id: uuid.UUID
    runtime_instance_id: uuid.UUID
    runtime_generation: int
    worker_instance_id: uuid.UUID
    tracker_instance_id: uuid.UUID
    tracking_seq: int
    latest_frame_id: int
    latest_timestamp_ms: int
    raw_detection_count: int
    active_track_count: int
    source_fps: float
    target_analysis_fps: float
    analysis_fps: float
    detector_ms: float | None
    tracker_ms: float | None
    pipeline_ms: float | None
    analysis_lag_ms: float
    gpu_util_pct: float | None
    vram_used_mb: float | None
    cpu_util_pct: float | None
    ram_used_mb: float | None
    dropped_analysis_frames: int
    queue_size: int
    profile: str

    def as_message(self) -> dict[str, Any]:
        message = asdict(self)
        message.update(
            session_id=str(self.session_id),
            runtime_instance_id=str(self.runtime_instance_id),
            worker_instance_id=str(self.worker_instance_id),
            tracker_instance_id=str(self.tracker_instance_id),
        )
        return {"type": "diagnostics", **message}


def normalize_bbox(
    bbox_xyxy: tuple[float, float, float, float],
    width: int,
    height: int,
) -> tuple[float, float, float, float]:
    if width <= 0 or height <= 0:
        raise ValueError("Source dimensions must be positive")
    x1, y1, x2, y2 = bbox_xyxy
    values = (x1 / width, y1 / height, x2 / width, y2 / height)
    clamped = tuple(max(0.0, min(1.0, float(value))) for value in values)
    return clamped  # type: ignore[return-value]


def bbox_iou(
    left: tuple[float, float, float, float],
    right: tuple[float, float, float, float],
) -> float:
    intersection_width = max(0.0, min(left[2], right[2]) - max(left[0], right[0]))
    intersection_height = max(0.0, min(left[3], right[3]) - max(left[1], right[1]))
    intersection = intersection_width * intersection_height
    left_area = max(0.0, left[2] - left[0]) * max(0.0, left[3] - left[1])
    right_area = max(0.0, right[2] - right[0]) * max(0.0, right[3] - right[1])
    union = left_area + right_area - intersection
    return intersection / union if union > 0 else 0.0


def suspicious_detection_overlaps(
    detections: list[Detection],
    threshold: float,
) -> list[dict[str, float | int]]:
    overlaps: list[dict[str, float | int]] = []
    for left_index, left in enumerate(detections):
        for right_index in range(left_index + 1, len(detections)):
            iou = bbox_iou(left.bbox_xyxy, detections[right_index].bbox_xyxy)
            if iou >= threshold:
                overlaps.append({"left": left_index, "right": right_index, "iou": round(iou, 4)})
    return overlaps
