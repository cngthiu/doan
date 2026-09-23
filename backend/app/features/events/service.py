from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.event_aggregation.types import AggregatedEvent, EventBehavior
from app.db.models.audit import AuditLog
from app.db.models.event import BehaviorType, Event, EventActor, EventSource, EventStatus
from app.db.models.session import SessionCandidate


def ai_event_code(event: AggregatedEvent) -> str:
    """Stable retry key derived only from the finalized semantic event."""
    return f"AI-{event.fingerprint[:40].upper()}"


def persist_ai_event(db: Session, event: AggregatedEvent) -> tuple[Event, bool]:
    """Persist one AI event and actors atomically; return ``created=False`` on retry."""
    event_code = ai_event_code(event)
    existing = db.scalar(select(Event).where(Event.event_code == event_code))
    if existing is not None:
        return existing, False

    actor_ids = tuple(sorted(set(event.session_candidate_ids), key=str))
    expected_actor_count = (
        2
        if event.behavior in {EventBehavior.COMMUNICATING, EventBehavior.EXCHANGE_OBJECT}
        else 1
    )
    if len(actor_ids) != expected_actor_count:
        raise ValueError(
            f"{event.behavior.value} requires exactly {expected_actor_count} EventActor(s)"
        )
    rows = tuple(
        db.scalars(
            select(SessionCandidate).where(SessionCandidate.id.in_(actor_ids))
        ).all()
    )
    if len(rows) != len(actor_ids) or any(row.session_id != event.session_id for row in rows):
        raise ValueError("AI event actors must be SessionCandidates from the event session")

    behavior = BehaviorType(event.behavior.value.upper())
    model = Event(
        event_code=event_code,
        session_id=event.session_id,
        source=EventSource.AI.value,
        behavior_type=behavior.value,
        start_ms=event.start_ms,
        end_ms=event.end_ms,
        peak_ms=event.peak_ms,
        ai_confidence=event.ai_confidence,
        status=EventStatus.PENDING_REVIEW.value,
        created_by=None,
    )
    db.add(model)
    db.flush()
    db.add_all(
        EventActor(event_id=model.id, session_candidate_id=actor_id, role=None)
        for actor_id in actor_ids
    )
    db.add(
        AuditLog(
            actor_user_id=None,
            action="AI_EVENT_CREATED",
            entity_type="EVENT",
            entity_id=model.id,
            audit_metadata={
                "event_code": event_code,
                "behavior": behavior.value,
                "session_id": str(event.session_id),
                "session_candidate_ids": [str(value) for value in actor_ids],
                "runtime_fingerprint": event.fingerprint,
            },
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        concurrent = db.scalar(select(Event).where(Event.event_code == event_code))
        if concurrent is None:
            raise
        return concurrent, False
    return model, True
