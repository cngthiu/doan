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
    frame_id: int
    timestamp_ms: int
    source_width: int
    source_height: int
    tracks: tuple[Track, ...]

    def as_message(self) -> dict[str, Any]:
        return {
            "type": "tracking",
            "session_id": str(self.session_id),
            "timestamp_ms": self.timestamp_ms,
            "frame_id": self.frame_id,
            "source_width": self.source_width,
            "source_height": self.source_height,
            "tracks": [asdict(track) for track in self.tracks],
        }


@dataclass(frozen=True, slots=True)
class RuntimeDiagnostics:
    session_id: uuid.UUID
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
        return {"type": "diagnostics", **asdict(self), "session_id": str(self.session_id)}


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
