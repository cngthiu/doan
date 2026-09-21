import uuid

from fastapi import APIRouter, Query, status

from app.features.auth.dependencies import AdminUser, CurrentUser, DatabaseSession
from app.features.candidates.schemas import CandidateCreate, CandidateResponse, CandidateUpdate
from app.features.candidates.service import (
    candidate_or_error,
    create_candidate,
    list_candidates,
    update_candidate,
)

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.get("", response_model=list[CandidateResponse])
def get_candidates(
    _: CurrentUser,
    db: DatabaseSession,
    q: str | None = Query(default=None, max_length=255),
) -> list[CandidateResponse]:
    return [CandidateResponse.model_validate(item) for item in list_candidates(db, q)]


@router.post("", response_model=CandidateResponse, status_code=status.HTTP_201_CREATED)
def post_candidate(
    payload: CandidateCreate,
    actor: AdminUser,
    db: DatabaseSession,
) -> CandidateResponse:
    return CandidateResponse.model_validate(create_candidate(db, payload, actor))


@router.get("/{candidate_id}", response_model=CandidateResponse)
def get_candidate(
    candidate_id: uuid.UUID,
    _: CurrentUser,
    db: DatabaseSession,
) -> CandidateResponse:
    return CandidateResponse.model_validate(candidate_or_error(db, candidate_id))


@router.patch("/{candidate_id}", response_model=CandidateResponse)
def patch_candidate(
    candidate_id: uuid.UUID,
    payload: CandidateUpdate,
    actor: AdminUser,
    db: DatabaseSession,
) -> CandidateResponse:
    return CandidateResponse.model_validate(update_candidate(db, candidate_id, payload, actor))
