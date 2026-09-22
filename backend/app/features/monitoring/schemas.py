from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field


class MonitoringPosition(BaseModel):
    timestamp_ms: int = Field(default=0, ge=0)


class MonitoringStatusResponse(BaseModel):
    session_id: uuid.UUID
    state: Literal["INACTIVE", "INITIALIZING", "RUNNING", "PAUSED", "COMPLETED", "ERROR"]
    profile: str | None
    error: str | None
    subscriber_count: int = Field(ge=0)
    queue_size: int = Field(ge=0, le=1)
    dropped_analysis_frames: int = Field(ge=0)
    diagnostics: dict[str, Any] | None
    runtime_instance_id: uuid.UUID | None = None
    runtime_generation: int | None = Field(default=None, ge=0)
    worker_instance_id: uuid.UUID | None = None
    tracker_instance_id: uuid.UUID | None = None
    tracking_seq: int = Field(default=0, ge=0)


class TrackingTrackMessage(BaseModel):
    track_id: int
    bbox_norm: tuple[float, float, float, float]
    confidence: float = Field(ge=0, le=1)


class TrackingMessage(BaseModel):
    type: Literal["tracking"]
    session_id: uuid.UUID
    runtime_instance_id: uuid.UUID
    runtime_generation: int = Field(ge=0)
    tracker_instance_id: uuid.UUID
    tracking_seq: int = Field(gt=0)
    timestamp_ms: int = Field(ge=0)
    frame_id: int = Field(ge=0)
    source_width: int = Field(gt=0)
    source_height: int = Field(gt=0)
    tracks: list[TrackingTrackMessage]


class DiagnosticsMessage(BaseModel):
    type: Literal["diagnostics"]
    session_id: uuid.UUID
    runtime_instance_id: uuid.UUID
    runtime_generation: int = Field(ge=0)
    worker_instance_id: uuid.UUID
    tracker_instance_id: uuid.UUID
    tracking_seq: int = Field(ge=0)
    latest_frame_id: int = Field(ge=0)
    latest_timestamp_ms: int = Field(ge=0)
    raw_detection_count: int = Field(ge=0)
    active_track_count: int = Field(ge=0)
    source_fps: float = Field(gt=0)
    target_analysis_fps: float = Field(gt=0)
    analysis_fps: float = Field(ge=0)
    detector_ms: float | None = Field(default=None, ge=0)
    tracker_ms: float | None = Field(default=None, ge=0)
    pipeline_ms: float | None = Field(default=None, ge=0)
    analysis_lag_ms: float = Field(ge=0)
    gpu_util_pct: float | None = Field(default=None, ge=0, le=100)
    vram_used_mb: float | None = Field(default=None, ge=0)
    cpu_util_pct: float | None = Field(default=None, ge=0, le=100)
    ram_used_mb: float | None = Field(default=None, ge=0)
    dropped_analysis_frames: int = Field(ge=0)
    queue_size: int = Field(ge=0, le=1)
    profile: str


class RuntimeStateMessage(BaseModel):
    type: Literal["state"]
    session_id: uuid.UUID
    state: Literal["INACTIVE", "INITIALIZING", "RUNNING", "PAUSED", "COMPLETED", "ERROR"]
    synchronizing: bool
    error: str | None
    runtime_instance_id: uuid.UUID
    runtime_generation: int = Field(ge=0)
    worker_instance_id: uuid.UUID | None = None
    tracker_instance_id: uuid.UUID | None = None
    tracking_seq: int = Field(ge=0)
