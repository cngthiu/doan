from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
import torch

from app.ai.detector.yolo import PersonDetector
from app.ai.domain import Detection, normalize_bbox
from app.ai.tracker.bytetrack import ByteTrackAdapter
from app.cli.render_tracking_artifact import nearest_row
from app.monitoring.config import (
    ByteTrackConfig,
    DetectorConfig,
    load_runtime_profile,
    load_runtime_profile_from_paths,
)
from tests.conftest import make_settings


class FakeBoxes:
    def __init__(self) -> None:
        self.xyxy = torch.tensor([[10.0, 20.0, 50.0, 90.0], [1.0, 2.0, 3.0, 4.0]])
        self.conf = torch.tensor([0.91, 0.75])
        self.cls = torch.tensor([0.0, 2.0])


class FakeModel:
    def __init__(self) -> None:
        self.arguments: dict[str, object] = {}

    def predict(self, **kwargs: object) -> list[SimpleNamespace]:
        self.arguments = kwargs
        return [SimpleNamespace(boxes=FakeBoxes())]


def detector_config(model: Path) -> DetectorConfig:
    return DetectorConfig(
        model=model,
        imgsz=640,
        conf=0.10,
        iou=0.70,
        classes=[0],
        max_det=32,
        half=True,
        device="cuda:0",
    )


def tracker_config() -> ByteTrackConfig:
    return ByteTrackConfig(
        tracker_type="bytetrack",
        track_high_thresh=0.25,
        track_low_thresh=0.10,
        new_track_thresh=0.25,
        track_buffer=20,
        match_thresh=0.80,
        fuse_score=True,
    )


def test_yolo_adapter_filters_person_and_passes_exact_configuration(tmp_path: Path) -> None:
    fake = FakeModel()
    detector = PersonDetector(detector_config(tmp_path / "unused.pt"), model=fake)
    detections = detector.detect(np.zeros((100, 100, 3), dtype=np.uint8))
    assert detections == [Detection((10.0, 20.0, 50.0, 90.0), pytest.approx(0.91), 0)]
    assert fake.arguments["classes"] == [0]
    assert fake.arguments["imgsz"] == 640
    assert fake.arguments["quantize"] == 16


def test_bbox_normalization_clamps_coordinates() -> None:
    assert normalize_bbox((-10, 20, 220, 120), 200, 100) == (0.0, 0.2, 1.0, 1.0)
    with pytest.raises(ValueError):
        normalize_bbox((0, 0, 1, 1), 0, 100)


def test_tracking_artifact_selects_one_nearest_frame_with_tolerance() -> None:
    rows = [{"timestamp_ms": "100"}, {"timestamp_ms": "180"}, {"timestamp_ms": "260"}]
    assert nearest_row(rows, 210, 40)["timestamp_ms"] == "180"
    with pytest.raises(ValueError, match="within the requested tolerance"):
        nearest_row(rows, 400, 40)


def test_bytetrack_adapter_extracts_ids_handles_empty_and_resets() -> None:
    tracker = ByteTrackAdapter(tracker_config())
    instance_id = tracker.instance_id
    detection = Detection((10, 10, 40, 80), 0.9, 0)
    first = tracker.update([detection], (100, 100), 40)
    assert len(first) == 1
    assert first[0].track_id == 1
    assert first[0].bbox_xyxy == pytest.approx((10, 10, 40, 80))
    assert [(event.event, event.track_id) for event in tracker.drain_lifecycle_events()] == [
        ("TRACK_CREATED", 1)
    ]
    assert tracker.update([], (100, 100), 80) == []
    assert tracker.drain_lifecycle_events()[0].event == "TRACK_LOST"
    with pytest.raises(ValueError, match="timestamp must increase"):
        tracker.update([detection], (100, 100), 80)
    tracker.reset()
    reset = tracker.update([detection], (100, 100), 20)
    assert reset[0].track_id == 1
    assert tracker.instance_id == instance_id


def test_runtime_profiles_match_phase_four_contract() -> None:
    root = Path(__file__).parents[1] / "configs"
    settings = make_settings(CONFIG_ROOT=root, MODEL_ROOT="/models", APP_PROFILE="gtx1650")
    gtx = load_runtime_profile(settings)
    rtx = load_runtime_profile(settings, "rtx3060")
    assert gtx.analysis.target_fps == 12.5
    assert gtx.analysis.minimum_fps == 10.0
    assert gtx.analysis.queue_size == 1
    assert gtx.analysis.drop_stale_frames is True
    assert gtx.tracker.track_buffer == 30
    assert gtx.detector.iou == 0.50
    assert gtx.detector.max_det == 64
    assert gtx.tracker.new_track_thresh == 0.50
    assert gtx.tracking_debug.enabled is False
    assert gtx.ui.tracking_interpolation is False
    assert gtx.ui.tracking_smoothing is False
    assert rtx.analysis.target_fps == 18
    assert rtx.tracker.track_buffer == 30
    assert gtx.detector.model == Path("/models/detection/yolo11n.pt")
    standalone = load_runtime_profile_from_paths(
        config_root=root,
        model_root=Path("/standalone-models"),
        profile_name="gtx1650",
    )
    assert standalone.detector.model == Path("/standalone-models/detection/yolo11n.pt")
    with pytest.raises(ValueError, match="không được hỗ trợ"):
        load_runtime_profile(settings, "unknown")
