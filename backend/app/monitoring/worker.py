from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import deque
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.ai.detector.yolo import PersonDetector
from app.ai.domain import RuntimeDiagnostics, Track, TrackingFrame, normalize_bbox
from app.ai.tracker.bytetrack import ByteTrackAdapter
from app.monitoring.buffer import LatestValueBuffer
from app.monitoring.clock import AnalysisClock
from app.monitoring.config import RuntimeProfile
from app.monitoring.decoder import FramePacket, VideoDecoder
from app.monitoring.metrics import read_system_metrics

logger = logging.getLogger(__name__)


class VideoAnalysisWorker:
    def __init__(
        self,
        *,
        session_id: uuid.UUID,
        video_path: Path,
        profile: RuntimeProfile,
        start_timestamp_ms: int,
        publish: Callable[[dict[str, Any]], None],
        on_ready: Callable[[], None],
        on_complete: Callable[[], None],
        on_error: Callable[[str], None],
        detector_factory: Callable[[Any], PersonDetector] = PersonDetector,
        tracker_factory: Callable[[Any], ByteTrackAdapter] = ByteTrackAdapter,
        decoder_factory: Callable[[Path], VideoDecoder] = VideoDecoder,
    ) -> None:
        self.session_id = session_id
        self.video_path = video_path
        self.profile = profile
        self.clock = AnalysisClock(start_timestamp_ms)
        self._publish = publish
        self._on_ready = on_ready
        self._on_complete = on_complete
        self._on_error = on_error
        self._detector_factory = detector_factory
        self._tracker_factory = tracker_factory
        self._decoder_factory = decoder_factory
        self._buffer: LatestValueBuffer[FramePacket] = LatestValueBuffer()
        self._stop = threading.Event()
        self._paused = threading.Event()
        self._producer_done = threading.Event()
        self._command_lock = threading.Lock()
        self._pending_seek: tuple[int, int] | None = (start_timestamp_ms, 0)
        self._generation = 0
        self._threads: list[threading.Thread] = []
        self._finish_lock = threading.Lock()
        self._finished = False
        self._intentional_stop = False
        self._decoder_drops = 0
        self.source_fps = 0.0

    def start(self) -> None:
        logger.info(
            "Starting monitoring runtime session=%s profile=%s device=%s model=%s "
            "detector=%s tracker=%s",
            self.session_id,
            self.profile.profile,
            self.profile.device,
            self.profile.detector.model,
            self.profile.detector.model_dump(exclude={"model", "device"}),
            self.profile.tracker.model_dump(),
        )
        self._threads = [
            threading.Thread(target=self._produce, name=f"decoder-{self.session_id}", daemon=True),
            threading.Thread(target=self._analyze, name=f"analysis-{self.session_id}", daemon=True),
        ]
        for thread in self._threads:
            thread.start()

    def pause(self, timestamp_ms: int | None = None) -> None:
        self.clock.pause(timestamp_ms)
        self._paused.set()
        self._buffer.clear()

    def resume(self, timestamp_ms: int | None = None) -> None:
        if timestamp_ms is not None:
            self.seek(timestamp_ms)
        self.clock.resume(timestamp_ms)
        self._paused.clear()

    def seek(self, timestamp_ms: int) -> None:
        if timestamp_ms < 0:
            raise ValueError("timestamp_ms must be non-negative")
        with self._command_lock:
            self._generation += 1
            self._pending_seek = (timestamp_ms, self._generation)
            self.clock.seek(timestamp_ms)
        self._buffer.clear()

    def stop(self, timeout: float = 5.0) -> bool:
        self._intentional_stop = True
        self._stop.set()
        self._paused.clear()
        self._buffer.close()
        current = threading.current_thread()
        deadline = time.monotonic() + timeout
        for thread in self._threads:
            if thread is not current and thread.is_alive():
                thread.join(timeout=max(0.0, deadline - time.monotonic()))
        return not any(thread is not current and thread.is_alive() for thread in self._threads)

    @property
    def queue_size(self) -> int:
        return self._buffer.size

    @property
    def dropped_analysis_frames(self) -> int:
        return self._buffer.dropped + self._decoder_drops

    @property
    def alive(self) -> bool:
        return any(thread.is_alive() for thread in self._threads)

    def _take_seek(self) -> tuple[tuple[int, int] | None, int]:
        with self._command_lock:
            command = self._pending_seek
            self._pending_seek = None
            return command, self._generation

    def _is_current_generation(self, generation: int) -> bool:
        with self._command_lock:
            return generation == self._generation

    def _produce(self) -> None:
        decoder: VideoDecoder | None = None
        interval = 1.0 / self.profile.analysis.target_fps
        next_sample = time.monotonic()
        try:
            decoder = self._decoder_factory(self.video_path)
            self.source_fps = decoder.source_fps
            logger.info(
                "Monitoring source session=%s path=%s width=%s height=%s fps=%.3f",
                self.session_id,
                self.video_path,
                decoder.source_width,
                decoder.source_height,
                decoder.source_fps,
            )
            while not self._stop.is_set():
                seek_command, generation = self._take_seek()
                if seek_command is not None:
                    timestamp_ms, generation = seek_command
                    decoder.seek(timestamp_ms)
                    next_sample = time.monotonic()
                if self._paused.is_set():
                    self._stop.wait(0.02)
                    next_sample = time.monotonic()
                    continue
                now = time.monotonic()
                if now < next_sample:
                    self._stop.wait(min(next_sample - now, 0.02))
                    continue
                if now - next_sample >= interval:
                    missed = int((now - next_sample) / interval)
                    self._decoder_drops += missed
                target_ms = self.clock.timestamp_ms(now)
                packet, discarded = decoder.read_for_timestamp(target_ms, generation)
                self._decoder_drops += discarded
                if packet is None:
                    return
                self._buffer.put(packet)
                next_sample = max(next_sample + interval, time.monotonic())
        except Exception as error:
            self._finish(error=f"Video decoder failure: {error}")
        finally:
            if decoder is not None:
                decoder.release()
            self._producer_done.set()

    def _analyze(self) -> None:
        completions: deque[float] = deque()
        last_diagnostics = 0.0
        last_generation = -1
        try:
            detector = self._detector_factory(self.profile.detector)
            tracker = self._tracker_factory(self.profile.tracker)
            if self._stop.is_set():
                return
            self._on_ready()
            while not self._stop.is_set():
                if self._paused.is_set():
                    self._stop.wait(0.02)
                    continue
                packet = self._buffer.get(timeout=0.1)
                if packet is None:
                    if self._producer_done.is_set():
                        self._finish(complete=True)
                        return
                    continue
                if packet.generation != last_generation:
                    tracker.reset()
                    last_generation = packet.generation
                pipeline_started = time.perf_counter()
                detector_started = time.perf_counter()
                detections = detector.detect(packet.frame)
                detector_ms = (time.perf_counter() - detector_started) * 1000
                tracker_started = time.perf_counter()
                tracked = tracker.update(detections, packet.frame.shape[:2])
                tracker_ms = (time.perf_counter() - tracker_started) * 1000
                if (
                    self._stop.is_set()
                    or self._paused.is_set()
                    or not self._is_current_generation(packet.generation)
                ):
                    continue
                tracks = tuple(
                    Track(
                        track_id=item.track_id,
                        bbox_norm=normalize_bbox(
                            item.bbox_xyxy,
                            packet.source_width,
                            packet.source_height,
                        ),
                        confidence=item.confidence,
                    )
                    for item in tracked
                )
                frame = TrackingFrame(
                    session_id=self.session_id,
                    frame_id=packet.frame_id,
                    timestamp_ms=packet.timestamp_ms,
                    source_width=packet.source_width,
                    source_height=packet.source_height,
                    tracks=tracks,
                )
                self._publish(frame.as_message())
                completed_at = time.monotonic()
                completions.append(completed_at)
                while completions and completions[0] < completed_at - 2.0:
                    completions.popleft()
                pipeline_ms = (time.perf_counter() - pipeline_started) * 1000
                diagnostic_interval = 1.0 / self.profile.diagnostics.publish_hz
                if completed_at - last_diagnostics >= diagnostic_interval:
                    system = read_system_metrics()
                    window = max(completed_at - completions[0], 1.0) if completions else 1.0
                    actual_fps = len(completions) / window
                    diagnostics = RuntimeDiagnostics(
                        session_id=self.session_id,
                        source_fps=self.source_fps,
                        target_analysis_fps=self.profile.analysis.target_fps,
                        analysis_fps=actual_fps,
                        detector_ms=detector_ms,
                        tracker_ms=tracker_ms,
                        pipeline_ms=pipeline_ms,
                        analysis_lag_ms=float(
                            max(0, self.clock.timestamp_ms() - packet.timestamp_ms)
                        ),
                        gpu_util_pct=system.gpu_util_pct,
                        vram_used_mb=system.vram_used_mb,
                        cpu_util_pct=system.cpu_util_pct,
                        ram_used_mb=system.ram_used_mb,
                        dropped_analysis_frames=self.dropped_analysis_frames,
                        queue_size=self.queue_size,
                        profile=self.profile.profile,
                    )
                    self._publish(diagnostics.as_message())
                    last_diagnostics = completed_at
        except Exception as error:
            self._finish(error=f"AI pipeline failure: {error}")

    def _finish(self, *, error: str | None = None, complete: bool = False) -> None:
        with self._finish_lock:
            if self._finished or self._intentional_stop:
                return
            self._finished = True
        self._stop.set()
        self._buffer.close()
        if error is not None:
            logger.exception("Monitoring runtime %s failed: %s", self.session_id, error)
            self._on_error(error)
        elif complete:
            self._on_complete()
