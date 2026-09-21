import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.errors import ApiError, error_payload
from app.db.session import get_session_factory
from app.features.monitoring.router import websocket_router
from app.features.monitoring.service import terminal_database_update
from app.monitoring.manager import MonitoringRuntimeManager, RuntimeState


def _persist_terminal_state(
    session_id: uuid.UUID,
    state: RuntimeState,
    _: str | None,
) -> None:
    with get_session_factory()() as db:
        terminal_database_update(db, session_id, state)


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    manager = MonitoringRuntimeManager(terminal_callback=_persist_terminal_state)
    application.state.monitoring_runtime = manager
    try:
        yield
    finally:
        manager.shutdown()


def create_app() -> FastAPI:
    application = FastAPI(
        title="ExamGuard API",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    application.include_router(api_router)
    application.include_router(websocket_router)

    @application.exception_handler(ApiError)
    async def api_error_handler(_: Request, error: ApiError) -> JSONResponse:
        return JSONResponse(status_code=error.status_code, content=error_payload(error))

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _: Request,
        error: RequestValidationError,
    ) -> JSONResponse:
        details = [
            {"location": list(item["loc"]), "message": item["msg"], "type": item["type"]}
            for item in error.errors()
        ]
        api_error = ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="Request validation failed",
            details={"errors": details},
        )
        return JSONResponse(status_code=422, content=error_payload(api_error))

    return application


app = create_app()
