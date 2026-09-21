from __future__ import annotations

import asyncio
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from app.ai.domain import Detection, TrackedObject
from app.monitoring.buffer import LatestValueBuffer
from app.monitoring.clock import AnalysisClock
from app.monitoring.config import (
    AnalysisConfig,
    ByteTrackConfig,
    DetectorConfig,
    DiagnosticsConfig,
    RuntimeProfile,
)
from app.monitoring.decoder import FramePacket
from app.monitoring.manager import MonitoringRuntimeManager, RuntimeState
from app.monitoring.publisher import LatestWebSocketPublisher
from app.monitoring.worker import VideoAnalysisWorker


def profile() -> RuntimeProfile:
    return RuntimeProfile(
        profile="gtx1650",
        device="cuda:0",
        precision="fp16",
        analysis=AnalysisConfig(
            target_fps=12.5,
            minimum_fps=8,
            queue_size=1,
            drop_stale_frames=True,
        ),
        detector=DetectorConfig(
            model=Path("/models/detection/yolo11n.pt"),
            imgsz=640,
            conf=0.1,
            iou=0.7,
            classes=[0],
            max_det=32,
            half=True,
            device="cuda:0",
        ),
        tracker=ByteTrackConfig(
            tracker_type="bytetrack",
            track_high_thresh=0.25,
            track_low_thresh=0.1,
            new_track_thresh=0.25,
            track_buffer=20,
            match_thresh=0.8,
            fuse_score=True,
        ),
        diagnostics=DiagnosticsConfig(publish_hz=2),
    )


class FakeDecoder:
    source_fps = 25.0
    source_width = 100
    source_height = 80

    def __init__(self, _: Path) -> None:
        self.frame_id = 0
        self.released = False

    def seek(self, timestamp_ms: int) -> None:
        self.frame_id = round(timestamp_ms / 40)

    def read_for_timestamp(self, target_ms: int, generation: int) -> tuple[FramePacket, int]:
        next_frame = max(self.frame_id + 1, round(target_ms / 40))
        dropped = max(0, next_frame - self.frame_id - 1)
        self.frame_id = next_frame
        return FramePacket(
            frame=np.zeros((80, 100, 3), dtype=np.uint8),
            frame_id=next_frame,
            timestamp_ms=next_frame * 40,
            source_width=100,
            source_height=80,
            generation=generation,
        ), dropped

    def release(self) -> None:
        self.released = True


class FakeDetector:
    def __init__(self, _: object, delay: float = 0.0) -> None:
        self.delay = delay

    def detect(self, _: np.ndarray) -> list[Detection]:
        time.sleep(self.delay)
        return [Detection((10, 10, 30, 70), 0.9, 0)]


class FakeTracker:
    def __init__(self, _: object) -> None:
        self.reset_count = 0

    def update(self, _: list[Detection], __: tuple[int, int]) -> list[TrackedObject]:
        return [TrackedObject(1, (10, 10, 30, 70), 0.9)]

    def reset(self) -> None:
        self.reset_count += 1


class BlockingDetector(FakeDetector):
    def __init__(self, config: object, entered: threading.Event, release: threading.Event) -> None:
        super().__init__(config)
        self.entered = entered
        self.release = release
        self.calls = 0

    def detect(self, frame: np.ndarray) -> list[Detection]:
        self.calls += 1
        if self.calls == 1:
            self.entered.set()
            assert self.release.wait(1)
        return super().detect(frame)


class FiniteDecoder(FakeDecoder):
    def __init__(self, path: Path) -> None:
        super().__init__(path)
        self.finished = False

    def read_for_timestamp(
        self,
        target_ms: int,
        generation: int,
    ) -> tuple[FramePacket | None, int]:
        if self.finished:
            return None, 0
        self.finished = True
        return super().read_for_timestamp(target_ms, generation)


def test_latest_buffer_never_grows_and_drops_stale_values() -> None:
    buffer: LatestValueBuffer[int] = LatestValueBuffer()
    buffer.put(1)
    buffer.put(2)
    buffer.put(3)
    assert buffer.size == 1
    assert buffer.dropped == 2
    assert buffer.get() == 3
    assert buffer.size == 0


def test_analysis_clock_pause_resume_and_seek() -> None:
    clock = AnalysisClock(1000)
    clock.pause(1250)
    time.sleep(0.01)
    assert clock.timestamp_ms() == 1250
    clock.seek(5000)
    assert clock.timestamp_ms() == 5000
    clock.resume(5000)
    time.sleep(0.01)
    assert clock.timestamp_ms() >= 5005


def test_websocket_publisher_keeps_only_latest_message_for_slow_client() -> None:
    async def scenario() -> None:
        publisher = LatestWebSocketPublisher()
        subscriber = publisher.subscribe()
        publisher.publish({"sequence": 1})
        publisher.publish({"sequence": 2})
        await asyncio.sleep(0)
        assert await subscriber.queue.get() == {"sequence": 2}

    asyncio.run(scenario())


def test_websocket_publisher_removes_subscriber_with_closed_loop() -> None:
    publisher = LatestWebSocketPublisher()
    loop = asyncio.new_event_loop()

    async def subscribe() -> None:
        publisher.subscribe()

    loop.run_until_complete(subscribe())
    loop.close()
    publisher.publish({"type": "tracking"})
    assert publisher.subscriber_count == 0


def test_worker_cadence_pause_seek_latest_drop_and_cleanup() -> None:
    messages: list[dict[str, Any]] = []
    ready = threading.Event()
    trackers: list[FakeTracker] = []
    decoders: list[FakeDecoder] = []

    def tracker_factory(config: object) -> FakeTracker:
        tracker = FakeTracker(config)
        trackers.append(tracker)
        return tracker

    def decoder_factory(path: Path) -> FakeDecoder:
        decoder = FakeDecoder(path)
        decoders.append(decoder)
        return decoder

    worker = VideoAnalysisWorker(
        session_id=uuid.uuid4(),
        video_path=Path("video.mp4"),
        profile=profile(),
        start_timestamp_ms=0,
        publish=messages.append,
        on_ready=ready.set,
        on_complete=lambda: None,
        on_error=lambda error: (_ for _ in ()).throw(AssertionError(error)),
        detector_factory=lambda config: FakeDetector(config, delay=0.12),
        tracker_factory=tracker_factory,
        decoder_factory=decoder_factory,
    )
    worker.start()
    assert ready.wait(0.5)
    time.sleep(0.42)
    tracking_before_pause = len([item for item in messages if item["type"] == "tracking"])
    assert 2 <= tracking_before_pause <= 5
    assert worker.queue_size <= 1
    assert worker.dropped_analysis_frames > 0
    worker.pause(1000)
    time.sleep(0.18)
    tracking_while_paused = len([item for item in messages if item["type"] == "tracking"])
    assert tracking_while_paused <= tracking_before_pause + 1
    worker.seek(5000)
    worker.resume(5000)
    time.sleep(0.22)
    assert worker.stop() is True
    assert worker.alive is False
    assert decoders[0].released is True
    assert trackers[0].reset_count >= 2
    timestamps = [item["timestamp_ms"] for item in messages if item["type"] == "tracking"]
    assert any(timestamp >= 5000 for timestamp in timestamps)


def test_worker_discards_inflight_result_from_before_seek() -> None:
    messages: list[dict[str, Any]] = []
    entered = threading.Event()
    release = threading.Event()
    ready = threading.Event()
    errors: list[str] = []
    worker = VideoAnalysisWorker(
        session_id=uuid.uuid4(),
        video_path=Path("video.mp4"),
        profile=profile(),
        start_timestamp_ms=0,
        publish=messages.append,
        on_ready=ready.set,
        on_complete=lambda: None,
        on_error=errors.append,
        detector_factory=lambda config: BlockingDetector(config, entered, release),
        tracker_factory=FakeTracker,
        decoder_factory=FakeDecoder,
    )
    worker.start()
    assert ready.wait(0.5)
    assert entered.wait(0.5)
    worker.seek(5000)
    release.set()
    time.sleep(0.25)
    assert worker.stop() is True
    assert errors == []
    tracking = [item for item in messages if item["type"] == "tracking"]
    assert tracking
    assert all(item["timestamp_ms"] >= 5000 for item in tracking)


def test_worker_completes_after_analyzing_final_frame_and_releasing_decoder() -> None:
    messages: list[dict[str, Any]] = []
    completed = threading.Event()
    decoders: list[FiniteDecoder] = []

    def decoder_factory(path: Path) -> FiniteDecoder:
        decoder = FiniteDecoder(path)
        decoders.append(decoder)
        return decoder

    worker = VideoAnalysisWorker(
        session_id=uuid.uuid4(),
        video_path=Path("video.mp4"),
        profile=profile(),
        start_timestamp_ms=0,
        publish=messages.append,
        on_ready=lambda: None,
        on_complete=completed.set,
        on_error=lambda error: (_ for _ in ()).throw(AssertionError(error)),
        detector_factory=FakeDetector,
        tracker_factory=FakeTracker,
        decoder_factory=decoder_factory,
    )
    worker.start()
    assert completed.wait(1)
    for _ in range(20):
        if not worker.alive:
            break
        time.sleep(0.01)
    assert worker.alive is False
    assert decoders[0].released is True
    assert len([item for item in messages if item["type"] == "tracking"]) == 1


def test_terminal_state_is_not_overwritten_by_late_worker_readiness(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.monitoring.manager.PersonDetector.validate_environment",
        lambda _: None,
    )
    terminal_states: list[RuntimeState] = []

    class CompletingBeforeReadyWorker:
        queue_size = 0
        dropped_analysis_frames = 0

        def __init__(self, **kwargs: Any) -> None:
            self.on_ready = kwargs["on_ready"]
            self.on_complete = kwargs["on_complete"]

        def start(self) -> None:
            self.on_complete()
            self.on_ready()

        def stop(self, timeout: float = 5.0) -> bool:
            return True

    manager = MonitoringRuntimeManager(
        worker_factory=CompletingBeforeReadyWorker,  # type: ignore[arg-type]
        terminal_callback=lambda _, state, __: terminal_states.append(state),
    )
    session_id = uuid.uuid4()
    result = manager.start(session_id, Path("video.mp4"), profile(), 0)
    assert result["state"] == RuntimeState.COMPLETED.value
    assert terminal_states == [RuntimeState.COMPLETED]
