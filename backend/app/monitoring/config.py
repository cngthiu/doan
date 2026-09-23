from __future__ import annotations

from pathlib import Path
from typing import Literal, cast

import yaml  # type: ignore[import-untyped]
from pydantic import BaseModel, Field, model_validator

from app.core.config import Settings


class AnalysisConfig(BaseModel):
    target_fps: float = Field(gt=0)
    minimum_fps: float = Field(gt=0)
    queue_size: Literal[1]
    drop_stale_frames: Literal[True]


class DuplicateSuppressionConfig(BaseModel):
    enabled: bool = True
    containment_threshold: float = Field(default=0.90, gt=0, le=1)
    max_area_ratio: float = Field(default=0.70, gt=0, lt=1)
    max_center_distance_ratio: float = Field(default=0.35, gt=0, le=1)
    preferred_detection_confidence: float = Field(default=0.25, gt=0, le=1)
    larger_box_min_confidence_ratio: float = Field(default=0.65, gt=0, le=1)


class DetectorConfig(BaseModel):
    model: Path
    imgsz: int = Field(gt=0)
    conf: float = Field(ge=0, le=1)
    iou: float = Field(ge=0, le=1)
    classes: list[int]
    max_det: int = Field(gt=0)
    half: bool
    device: str = "cuda:0"
    duplicate_suppression: DuplicateSuppressionConfig = Field(
        default_factory=DuplicateSuppressionConfig
    )

    @model_validator(mode="after")
    def person_only(self) -> DetectorConfig:
        if self.classes != [0]:
            raise ValueError("Phase 4 detector must use COCO person class only")
        return self


class ByteTrackConfig(BaseModel):
    tracker_type: Literal["bytetrack"]
    track_high_thresh: float = Field(ge=0, le=1)
    track_low_thresh: float = Field(ge=0, le=1)
    new_track_thresh: float = Field(ge=0, le=1)
    track_buffer: int = Field(gt=0)
    match_thresh: float = Field(ge=0, le=1)
    fuse_score: bool


class DiagnosticsConfig(BaseModel):
    publish_hz: float = Field(gt=0, le=10)


class SeatAssignmentConfig(BaseModel):
    enabled: bool = True
    overlap_weight: float = Field(default=0.70, ge=0)
    distance_weight: float = Field(default=0.30, ge=0)
    min_score: float = Field(default=0.35, ge=0, le=1)
    seat_expand_ratio: float = Field(default=0.08, ge=0)
    confirm_ms: int = Field(default=600, ge=0)
    release_ms: int = Field(default=1500, ge=0)
    switch_margin: float = Field(default=0.15, ge=0)
    switch_confirm_ms: int = Field(default=800, ge=0)

    @model_validator(mode="after")
    def positive_weight_sum(self) -> SeatAssignmentConfig:
        if self.overlap_weight + self.distance_weight <= 0:
            raise ValueError("seat-assignment weights must have a positive sum")
        return self


class ActionRoiGeometryConfig(BaseModel):
    expand_x: float = Field(ge=0)
    expand_top: float = Field(ge=0)
    expand_bottom: float = Field(ge=0)
    min_crop_width_px: int = Field(gt=0)
    min_crop_height_px: int = Field(gt=0)


class ActionAdjacencyConfig(BaseModel):
    row_tolerance_ratio: float = Field(default=0.75, ge=0)
    max_horizontal_gap_ratio: float = Field(default=2.5, ge=0)


class ActionSchedulingConfig(BaseModel):
    prediction_stride_ms: int = Field(default=1500, gt=0)
    max_batch_size: int = Field(default=2, gt=0, le=8)
    max_queue_size: Literal[1] = 1
    max_prediction_age_ms: int = Field(default=2000, gt=0)
    min_inference_interval_ms: int = Field(default=200, ge=0)


class ActionRecognitionConfig(BaseModel):
    enabled: bool = False
    model: Path = Path("action/r3/model.pth")
    checkpoint_sha256: str = "c5ef406cfe404d2883575d8dcf1306fd7bebc6d6b1ec723b5093f2a3e09b357c"
    architecture: Literal["TSM-ResNet50"] = "TSM-ResNet50"
    num_segments: Literal[8] = 8
    input_size: Literal[224] = 224
    clip_span_ms: Literal[4000] = 4000
    capture_interval_ms: int = Field(default=200, gt=0)
    sample_tolerance_ms: int = Field(default=180, ge=0)
    max_gap_ms: int = Field(default=750, gt=0)
    precision: Literal["fp16", "fp32"] = "fp32"
    scheduling: ActionSchedulingConfig = Field(default_factory=ActionSchedulingConfig)
    single_roi: ActionRoiGeometryConfig = Field(
        default_factory=lambda: ActionRoiGeometryConfig(
            expand_x=0.04,
            expand_top=0.03,
            expand_bottom=0.08,
            min_crop_width_px=128,
            min_crop_height_px=128,
        )
    )
    pair_roi: ActionRoiGeometryConfig = Field(
        default_factory=lambda: ActionRoiGeometryConfig(
            expand_x=0.025,
            expand_top=0.02,
            expand_bottom=0.06,
            min_crop_width_px=128,
            min_crop_height_px=128,
        )
    )
    adjacency: ActionAdjacencyConfig = Field(default_factory=ActionAdjacencyConfig)


class TrackingDebugConfig(BaseModel):
    enabled: bool = False
    log_every_n_frames: int = Field(default=10, gt=0)
    suspicious_iou_threshold: float = Field(default=0.5, gt=0, le=1)


class TrackingUiConfig(BaseModel):
    tracking_interpolation: Literal[False] = False
    tracking_smoothing: Literal[False] = False


class RuntimeProfile(BaseModel):
    profile: Literal["gtx1650", "rtx3060"]
    device: str
    precision: Literal["fp16"]
    analysis: AnalysisConfig
    detector: DetectorConfig
    tracker: ByteTrackConfig
    diagnostics: DiagnosticsConfig
    seat_assignment: SeatAssignmentConfig = Field(default_factory=SeatAssignmentConfig)
    action_recognition: ActionRecognitionConfig = Field(default_factory=ActionRecognitionConfig)
    tracking_debug: TrackingDebugConfig = Field(default_factory=TrackingDebugConfig)
    ui: TrackingUiConfig = Field(default_factory=TrackingUiConfig)


def _yaml_mapping(path: Path) -> dict[str, object]:
    try:
        payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as error:
        raise ValueError(f"Không thể đọc cấu hình {path}: {error}") from error
    if not isinstance(payload, dict):
        raise ValueError(f"Cấu hình {path} phải là YAML mapping")
    return payload


def load_runtime_profile(settings: Settings, profile_name: str | None = None) -> RuntimeProfile:
    return load_runtime_profile_from_paths(
        config_root=settings.config_root,
        model_root=settings.model_root,
        profile_name=profile_name or settings.app_profile,
    )


def load_runtime_profile_from_paths(
    *,
    config_root: Path,
    model_root: Path,
    profile_name: str,
) -> RuntimeProfile:
    name = profile_name
    if name not in {"gtx1650", "rtx3060"}:
        raise ValueError(f"Runtime profile không được hỗ trợ: {name}")
    validated_name = cast(Literal["gtx1650", "rtx3060"], name)
    payload = _yaml_mapping(config_root / "runtime" / f"{name}.yaml")
    runtime = payload.get("runtime")
    detector = payload.get("detector")
    tracker = payload.get("tracker")
    if (
        not isinstance(runtime, dict)
        or not isinstance(detector, dict)
        or not isinstance(tracker, dict)
    ):
        raise ValueError("Runtime, detector và tracker configuration là bắt buộc")

    model = Path(str(detector.get("model", "")))
    if model.is_absolute() and model.parts[:2] == ("/", "models"):
        model = model_root.joinpath(*model.parts[2:])
    detector_payload = {**detector, "model": model, "device": runtime.get("device")}

    raw_action_payload = payload.get("action_recognition") or {}
    if not isinstance(raw_action_payload, dict):
        raise ValueError("Action recognition configuration must be a mapping")
    action_payload = dict(raw_action_payload)
    action_model = Path(str(action_payload.get("model", "action/r3/model.pth")))
    if action_model.is_absolute() and action_model.parts[:2] == ("/", "models"):
        action_model = model_root.joinpath(*action_model.parts[2:])
    elif not action_model.is_absolute():
        action_model = model_root / action_model
    action_payload["model"] = action_model

    tracker_path = Path(str(tracker.get("config", "")))
    if tracker_path.is_absolute() and tracker_path.parts[:3] == ("/", "app", "configs"):
        tracker_path = config_root.joinpath(*tracker_path.parts[3:])

    if runtime.get("precision") != "fp16":
        raise ValueError("Phase 4 runtime precision phải là fp16")
    return RuntimeProfile(
        profile=validated_name,
        device=str(runtime.get("device")),
        precision="fp16",
        analysis=AnalysisConfig.model_validate(payload.get("analysis")),
        detector=DetectorConfig.model_validate(detector_payload),
        tracker=ByteTrackConfig.model_validate(_yaml_mapping(tracker_path)),
        diagnostics=DiagnosticsConfig.model_validate(payload.get("diagnostics")),
        seat_assignment=SeatAssignmentConfig.model_validate(payload.get("seat_assignment") or {}),
        action_recognition=ActionRecognitionConfig.model_validate(action_payload),
        tracking_debug=TrackingDebugConfig.model_validate(payload.get("tracking_debug") or {}),
        ui=TrackingUiConfig.model_validate(payload.get("ui") or {}),
    )
