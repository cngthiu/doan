import uuid

from fastapi import status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.db.models.candidate import Candidate
from app.db.models.user import User
from app.features.candidates.schemas import CandidateCreate, CandidateUpdate
from app.shared.audit import AuditAction, AuditService


def candidate_or_error(db: Session, candidate_id: uuid.UUID) -> Candidate:
    candidate = db.get(Candidate, candidate_id)
    if candidate is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND,
            "CANDIDATE_NOT_FOUND",
            "Candidate was not found",
        )
    return candidate


def list_candidates(db: Session, query: str | None = None) -> list[Candidate]:
    statement = select(Candidate)
    if query and (term := query.strip()):
        pattern = f"%{term}%"
        statement = statement.where(
            or_(
                Candidate.candidate_code.ilike(pattern),
                Candidate.full_name.ilike(pattern),
                Candidate.class_name.ilike(pattern),
            )
        )
    return list(db.scalars(statement.order_by(Candidate.candidate_code)))


def create_candidate(db: Session, payload: CandidateCreate, actor: User) -> Candidate:
    if db.scalar(select(Candidate.id).where(Candidate.candidate_code == payload.candidate_code)):
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "CANDIDATE_CODE_EXISTS",
            "Candidate code already exists",
        )
    candidate = Candidate(**payload.model_dump())
    db.add(candidate)
    try:
        db.flush()
        AuditService.record(
            db,
            actor=actor,
            action=AuditAction.CANDIDATE_CREATED,
            entity_type="CANDIDATE",
            entity_id=candidate.id,
            metadata={"candidate_code": candidate.candidate_code},
        )
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "CANDIDATE_CODE_EXISTS",
            "Candidate code already exists",
        ) from error
    db.refresh(candidate)
    return candidate


def update_candidate(
    db: Session,
    candidate_id: uuid.UUID,
    payload: CandidateUpdate,
    actor: User,
) -> Candidate:
    candidate = candidate_or_error(db, candidate_id)
    changes = payload.model_dump(exclude_unset=True)
    new_code = changes.get("candidate_code")
    if isinstance(new_code, str) and db.scalar(
        select(Candidate.id).where(
            Candidate.candidate_code == new_code,
            Candidate.id != candidate.id,
        )
    ):
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "CANDIDATE_CODE_EXISTS",
            "Candidate code already exists",
        )
    for field, value in changes.items():
        setattr(candidate, field, value)
    try:
        db.flush()
        AuditService.record(
            db,
            actor=actor,
            action=AuditAction.CANDIDATE_UPDATED,
            entity_type="CANDIDATE",
            entity_id=candidate.id,
            metadata={
                "candidate_code": candidate.candidate_code,
                "changed_fields": sorted(changes),
            },
        )
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise ApiError(
            status.HTTP_409_CONFLICT,
            "CANDIDATE_CODE_EXISTS",
            "Candidate code already exists",
        ) from error
    db.refresh(candidate)
    return candidate
