from __future__ import annotations

from types import SimpleNamespace

import numpy as np
from ultralytics.engine.results import Boxes
from ultralytics.trackers.byte_tracker import BYTETracker

from app.ai.domain import Detection, TrackedObject
from app.monitoring.config import ByteTrackConfig


class ByteTrackAdapter:
    def __init__(self, config: ByteTrackConfig) -> None:
        self.config = config
        self._tracker = BYTETracker(SimpleNamespace(**config.model_dump()))

    def update(
        self,
        detections: list[Detection],
        frame_shape: tuple[int, int],
    ) -> list[TrackedObject]:
        rows = np.asarray(
            [
                [*detection.bbox_xyxy, detection.confidence, detection.class_id]
                for detection in detections
            ],
            dtype=np.float32,
        ).reshape((-1, 6))
        results = self._tracker.update(Boxes(rows, orig_shape=frame_shape))
        return [
            TrackedObject(
                track_id=int(row[4]),
                bbox_xyxy=tuple(float(value) for value in row[:4]),  # type: ignore[arg-type]
                confidence=float(row[5]),
            )
            for row in results
        ]

    def reset(self) -> None:
        self._tracker.reset()
