from __future__ import annotations

import asyncio
import threading
import uuid
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class Subscriber:
    id: uuid.UUID
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue[dict[str, Any]]


class LatestWebSocketPublisher:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: dict[uuid.UUID, Subscriber] = {}

    def subscribe(self) -> Subscriber:
        subscriber = Subscriber(uuid.uuid4(), asyncio.get_running_loop(), asyncio.Queue(maxsize=1))
        with self._lock:
            self._subscribers[subscriber.id] = subscriber
        return subscriber

    def unsubscribe(self, subscriber_id: uuid.UUID) -> None:
        with self._lock:
            self._subscribers.pop(subscriber_id, None)

    def publish(self, message: dict[str, Any]) -> None:
        with self._lock:
            subscribers = tuple(self._subscribers.values())
        closed_subscribers: list[uuid.UUID] = []
        for subscriber in subscribers:
            try:
                subscriber.loop.call_soon_threadsafe(self._offer_latest, subscriber.queue, message)
            except RuntimeError:
                closed_subscribers.append(subscriber.id)
        if closed_subscribers:
            with self._lock:
                for subscriber_id in closed_subscribers:
                    self._subscribers.pop(subscriber_id, None)

    @staticmethod
    def _offer_latest(
        queue: asyncio.Queue[dict[str, Any]],
        message: dict[str, Any],
    ) -> None:
        if queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        queue.put_nowait(message)

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)
