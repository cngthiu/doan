from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import torch

from app.ai.domain import Detection
from app.monitoring.config import DetectorConfig


class DetectorInitializationError(RuntimeError):
    pass


class PersonDetector:
    def __init__(
        self,
        config: DetectorConfig,
        *,
        model: Any | None = None,
        model_factory: Callable[[str], Any] | None = None,
    ) -> None:
        self.config = config
        if model is not None:
            self._model = model
            return
        self.validate_environment(config)
        if model_factory is None:
            from ultralytics import YOLO

            model_factory = YOLO
        try:
            self._model = model_factory(str(config.model))
        except Exception as error:
            raise DetectorInitializationError(f"Không thể tải YOLO11n: {error}") from error

    @staticmethod
    def validate_environment(config: DetectorConfig) -> None:
        if not Path(config.model).is_file():
            raise DetectorInitializationError(f"Không tìm thấy model YOLO11n: {config.model}")
        if config.device.startswith("cuda") and not torch.cuda.is_available():
            raise DetectorInitializationError(
                f"CUDA không khả dụng nhưng profile yêu cầu {config.device}"
            )

    def detect(self, frame: np.ndarray) -> list[Detection]:
        results = self._model.predict(
            source=frame,
            imgsz=self.config.imgsz,
            conf=self.config.conf,
            iou=self.config.iou,
            classes=self.config.classes,
            max_det=self.config.max_det,
            device=self.config.device,
            quantize=16 if self.config.half else None,
            verbose=False,
        )
        if not results:
            return []
        boxes = results[0].boxes
        if boxes is None:
            return []
        xyxy = boxes.xyxy.detach().cpu().numpy()
        confidences = boxes.conf.detach().cpu().numpy()
        classes = boxes.cls.detach().cpu().numpy()
        return [
            Detection(
                bbox_xyxy=tuple(float(value) for value in box),  # type: ignore[arg-type]
                confidence=float(confidence),
                class_id=int(class_id),
            )
            for box, confidence, class_id in zip(xyxy, confidences, classes, strict=True)
            if int(class_id) == 0
        ]
