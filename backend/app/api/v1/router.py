from fastapi import APIRouter

from app.features.auth.router import router as auth_router
from app.features.candidates.router import router as candidates_router
from app.features.health.router import router as health_router
from app.features.media.router import router as media_router
from app.features.monitoring.router import router as monitoring_router
from app.features.rooms.router import router as rooms_router
from app.features.sessions.router import router as sessions_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(rooms_router)
api_router.include_router(candidates_router)
api_router.include_router(media_router)
api_router.include_router(sessions_router)
api_router.include_router(monitoring_router)
