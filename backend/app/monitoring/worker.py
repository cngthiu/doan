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
from app.ai.domain import (
    Detection,
    RuntimeDiagnostics,
    Track,
    TrackedObject,
    TrackingFrame,
    normalize_bbox,
    suspicious_detection_overlaps,
)
from app.ai.seat_identity.assignment import SeatAssignmentEngine
from app.ai.seat_identity.types import AssignmentState, SeatIdentityContext, TrackIdentity
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
        runtime_instance_id: uuid.UUID | None = None,
        seat_identity_context: SeatIdentityContext | None = None,
        seat_assignment_factory: Callable[..., SeatAssignmentEngine] = SeatAssignmentEngine,
    ) -> None:
        self.session_id = session_id
        self.runtime_instance_id = runtime_instance_id or uuid.uuid4()
        self.worker_instance_id = uuid.uuid4()
        self.video_path = video_path
        self.profile = profile
        self.seat_identity_context = seat_identity_context or SeatIdentityContext.empty(session_id)
        self.clock = AnalysisClock(start_timestamp_ms)
        self._publish = publish
        self._on_ready = on_ready
        self._on_complete = on_complete
        self._on_error = on_error
        self._detector_factory = detector_factory
        self._tracker_factory = tracker_factory
        self._decoder_factory = decoder_factory
        self._seat_assignment_factory = seat_assignment_factory
        self._buffer: LatestValueBuffer[FramePacket] = LatestValueBuffer()
        self._stop = threading.Event()
        self._paused = threading.Event()
        self._producer_done = threading.Event()
        self._command_lock = threading.Lock()
        self._pending_seek: tuple[int, int] | None = (start_timestamp_ms, 0)
        self._generation = 0
        self._tracking_seq = 0
        self._threads: list[threading.Thread] = []
        self._finish_lock = threading.Lock()
        self._finished = False
        self._intentional_stop = False
        self._decoder_drops = 0
        self._out_of_order_drops = 0
        self.source_fps = 0.0

    def start(self) -> None:
        logger.info(
            "Starting monitoring runtime session=%s runtime_instance=%s worker_instance=%s "
            "profile=%s device=%s model=%s detector=%s tracker=%s",
            self.session_id,
            self.runtime_instance_id,
            self.worker_instance_id,
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
        self.clock.resume(timestamp_ms)
        self._paused.clear()

    def seek(self, timestamp_ms: int) -> None:
        if timestamp_ms < 0:
            raise ValueError("timestamp_ms must be non-negative")
        with self._command_lock:
            self._generation += 1
            self._tracking_seq = 0
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
        return self._buffer.dropped + self._decoder_drops + self._out_of_order_drops

    @property
    def alive(self) -> bool:
        return any(thread.is_alive() for thread in self._threads)

    @property
    def runtime_generation(self) -> int:
        with self._command_lock:
            return self._generation

    @property
    def tracking_seq(self) -> int:
        with self._command_lock:
            return self._tracking_seq

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
        last_generation: int | None = None
        last_tracking_timestamp_ms: int | None = None
        try:
            detector = self._detector_factory(self.profile.detector)
            tracker = self._tracker_factory(self.profile.tracker)
            seat_assignment = self._seat_assignment_factory(
                self.seat_identity_context,
                self.profile.seat_assignment,
            )
            tracker_instance_id = getattr(tracker, "instance_id", uuid.uuid4())
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
                if last_generation is None:
                    last_generation = packet.generation
                elif packet.generation != last_generation:
                    tracker.reset()
                    seat_assignment.reset()
                    last_generation = packet.generation
                    last_tracking_timestamp_ms = None
                if (
                    last_tracking_timestamp_ms is not None
                    and packet.timestamp_ms <= last_tracking_timestamp_ms
                ):
                    self._out_of_order_drops += 1
                    if self.profile.tracking_debug.enabled:
                        logger.warning(
                            "tracking_stale_drop session=%s runtime_instance=%s "
                            "runtime_generation=%s frame=%s timestamp_ms=%s "
                            "previous_timestamp_ms=%s",
                            self.session_id,
                            self.runtime_instance_id,
                            packet.generation,
                            packet.frame_id,
                            packet.timestamp_ms,
                            last_tracking_timestamp_ms,
                        )
                    continue
                pipeline_started = time.perf_counter()
                detector_started = time.perf_counter()
                detections = detector.detect(packet.frame)
                detector_ms = (time.perf_counter() - detector_started) * 1000
                tracker_started = time.perf_counter()
                tracked = tracker.update(
                    detections,
                    packet.frame.shape[:2],
                    packet.timestamp_ms,
                )
                last_tracking_timestamp_ms = packet.timestamp_ms
                tracker_ms = (time.perf_counter() - tracker_started) * 1000
                if (
                    self._stop.is_set()
                    or self._paused.is_set()
                    or not self._is_current_generation(packet.generation)
                ):
                    continue
                with self._command_lock:
                    if packet.generation != self._generation:
                        continue
                    self._tracking_seq += 1
                    tracking_seq = self._tracking_seq
                normalized_tracks = tuple(
                    Track(
                        track_id=item.track_id,
                        bbox_norm=normalize_bbox(
                            item.bbox_xyxy,
                            packet.source_width,
                            packet.source_height,
                        ),
                        confidence=item.confidence,
                        identity=TrackIdentity(state=AssignmentState.UNASSIGNED),
                    )
                    for item in tracked
                )
                seat_assignment_started = time.perf_counter()
                seat_snapshot = seat_assignment.update(
                    normalized_tracks,
                    packet.timestamp_ms,
                )
                seat_assignment_ms = (time.perf_counter() - seat_assignment_started) * 1000
                tracks = tuple(
                    Track(
                        track_id=track.track_id,
                        bbox_norm=track.bbox_norm,
                        confidence=track.confidence,
                        identity=seat_snapshot.identities[track.track_id],
                    )
                    for track in normalized_tracks
                )
                frame = TrackingFrame(
                    session_id=self.session_id,
                    runtime_instance_id=self.runtime_instance_id,
                    runtime_generation=packet.generation,
                    tracker_instance_id=tracker_instance_id,
                    tracking_seq=tracking_seq,
                    frame_id=packet.frame_id,
                    timestamp_ms=packet.timestamp_ms,
                    source_width=packet.source_width,
                    source_height=packet.source_height,
                    tracks=tracks,
                    seats=seat_snapshot.seats,
                )
                self._publish(frame.as_message())
                self._log_tracking_debug(
                    packet=packet,
                    detections=detections,
                    tracked=tracked,
                    tracker=tracker,
                    tracker_instance_id=tracker_instance_id,
                    tracking_seq=tracking_seq,
                )
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
                        runtime_instance_id=self.runtime_instance_id,
                        runtime_generation=packet.generation,
                        worker_instance_id=self.worker_instance_id,
                        tracker_instance_id=tracker_instance_id,
                        tracking_seq=tracking_seq,
                        latest_frame_id=packet.frame_id,
                        latest_timestamp_ms=packet.timestamp_ms,
                        raw_detection_count=len(detections),
                        active_track_count=len(tracked),
                        source_fps=self.source_fps,
                        target_analysis_fps=self.profile.analysis.target_fps,
                        analysis_fps=actual_fps,
                        detector_ms=detector_ms,
                        tracker_ms=tracker_ms,
                        pipeline_ms=pipeline_ms,
                        seat_assignment_ms=seat_assignment_ms,
                        analysis_lag_ms=float(
                            max(0, self.clock.timestamp_ms() - packet.timestamp_ms)
                        ),
                        gpu_util_pct=system.gpu_util_pct,
                        vram_used_mb=system.vram_used_mb,
                        cpu_util_pct=system.cpu_util_pct,
                        ram_used_mb=system.ram_used_mb,
                        dropped_analysis_frames=self.dropped_analysis_frames,
                        queue_size=self.queue_size,
                        assigned_tracks=seat_snapshot.assigned_tracks,
                        tentative_tracks=seat_snapshot.tentative_tracks,
                        unassigned_tracks=seat_snapshot.unassigned_tracks,
                        occupied_seats=seat_snapshot.occupied_seats,
                        grace_seats=seat_snapshot.grace_seats,
                        empty_seats=seat_snapshot.empty_seats,
                        seat_switches=seat_snapshot.seat_switches,
                        identity_recoveries=seat_snapshot.identity_recoveries,
                        profile=self.profile.profile,
                    )
                    self._publish(diagnostics.as_message())
                    last_diagnostics = completed_at
        except Exception as error:
            self._finish(error=f"AI pipeline failure: {error}")

    def _log_tracking_debug(
        self,
        *,
        packet: FramePacket,
        detections: list[Detection],
        tracked: list[TrackedObject],
        tracker: Any,
        tracker_instance_id: uuid.UUID,
        tracking_seq: int,
    ) -> None:
        debug = self.profile.tracking_debug
        lifecycle_events = getattr(tracker, "drain_lifecycle_events", lambda: ())()
        if not debug.enabled:
            return
        periodic_frame = packet.frame_id % debug.log_every_n_frames == 0
        for event in lifecycle_events:
            if event.event == "TRACK_UPDATED" and not periodic_frame:
                continue
            logger.info(
                "tracking_lifecycle session=%s runtime_instance=%s runtime_generation=%s "
                "tracker_instance=%s timestamp_ms=%s event=%s track_id=%s",
                self.session_id,
                self.runtime_instance_id,
                packet.generation,
                tracker_instance_id,
                packet.timestamp_ms,
                event.event,
                event.track_id,
            )
        if not periodic_frame:
            return
        detection_boxes = [
            {
                "bbox": tuple(round(value, 2) for value in detection.bbox_xyxy),
                "confidence": round(detection.confidence, 4),
                "class_id": detection.class_id,
            }
            for detection in detections
        ]
        suspicious_overlaps = suspicious_detection_overlaps(
            detections,
            debug.suspicious_iou_threshold,
        )
        logger.info(
            "tracking_debug session=%s frame=%s timestamp_ms=%s tracking_seq=%s "
            "detections=%s tracks=%s detection_boxes=%s suspicious_overlaps=%s track_ids=%s "
            "runtime_instance=%s runtime_generation=%s worker_instance=%s tracker_instance=%s",
            self.session_id,
            packet.frame_id,
            packet.timestamp_ms,
            tracking_seq,
            len(detections),
            len(tracked),
            detection_boxes,
            suspicious_overlaps,
            [item.track_id for item in tracked],
            self.runtime_instance_id,
            packet.generation,
            self.worker_instance_id,
            tracker_instance_id,
        )

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
