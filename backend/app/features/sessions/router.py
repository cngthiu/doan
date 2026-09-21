import uuid

from fastapi import APIRouter, status

from app.features.auth.dependencies import (
    ApplicationSettings,
    CurrentUser,
    DatabaseSession,
    SessionEditor,
)
from app.features.sessions.schemas import (
    SessionCandidatesUpdate,
    SessionCreate,
    SessionResponse,
    SessionUpdate,
)
from app.features.sessions.service import (
    create_session,
    list_sessions,
    replace_assignments,
    session_or_error,
    session_response,
    update_session,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionResponse])
def get_sessions(_: CurrentUser, db: DatabaseSession) -> list[SessionResponse]:
    return list_sessions(db)


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def post_session(
    payload: SessionCreate,
    actor: SessionEditor,
    db: DatabaseSession,
) -> SessionResponse:
    return create_session(db, payload, actor)


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: uuid.UUID,
    _: CurrentUser,
    db: DatabaseSession,
) -> SessionResponse:
    return session_response(db, session_or_error(db, session_id))


@router.patch("/{session_id}", response_model=SessionResponse)
def patch_session(
    session_id: uuid.UUID,
    payload: SessionUpdate,
    actor: SessionEditor,
    db: DatabaseSession,
    settings: ApplicationSettings,
) -> SessionResponse:
    return update_session(db, session_id, payload, actor, settings)


@router.put("/{session_id}/candidates", response_model=SessionResponse)
def put_session_candidates(
    session_id: uuid.UUID,
    payload: SessionCandidatesUpdate,
    actor: SessionEditor,
    db: DatabaseSession,
) -> SessionResponse:
    return replace_assignments(db, session_id, payload, actor)
