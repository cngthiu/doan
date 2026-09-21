import uuid

from fastapi import APIRouter, status

from app.features.auth.dependencies import AdminUser, CurrentUser, DatabaseSession
from app.features.rooms.schemas import (
    RoomCreate,
    RoomResponse,
    RoomUpdate,
    SeatLayoutUpdate,
    SeatResponse,
)
from app.features.rooms.service import (
    create_room,
    list_active_seats,
    list_rooms,
    replace_seat_layout,
    room_or_error,
    update_room,
)

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=list[RoomResponse])
def get_rooms(_: CurrentUser, db: DatabaseSession) -> list[RoomResponse]:
    return [RoomResponse.model_validate(room) for room in list_rooms(db)]


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
def post_room(payload: RoomCreate, actor: AdminUser, db: DatabaseSession) -> RoomResponse:
    return RoomResponse.model_validate(create_room(db, payload, actor))


@router.get("/{room_id}", response_model=RoomResponse)
def get_room(room_id: uuid.UUID, _: CurrentUser, db: DatabaseSession) -> RoomResponse:
    return RoomResponse.model_validate(room_or_error(db, room_id))


@router.patch("/{room_id}", response_model=RoomResponse)
def patch_room(
    room_id: uuid.UUID,
    payload: RoomUpdate,
    actor: AdminUser,
    db: DatabaseSession,
) -> RoomResponse:
    return RoomResponse.model_validate(update_room(db, room_id, payload, actor))


@router.get("/{room_id}/seats", response_model=list[SeatResponse])
def get_seats(
    room_id: uuid.UUID,
    _: CurrentUser,
    db: DatabaseSession,
) -> list[SeatResponse]:
    return [SeatResponse.model_validate(seat) for seat in list_active_seats(db, room_id)]


@router.put("/{room_id}/seats", response_model=list[SeatResponse])
def put_seats(
    room_id: uuid.UUID,
    payload: SeatLayoutUpdate,
    actor: AdminUser,
    db: DatabaseSession,
) -> list[SeatResponse]:
    seats = replace_seat_layout(db, room_id, payload, actor)
    return [SeatResponse.model_validate(seat) for seat in seats]
