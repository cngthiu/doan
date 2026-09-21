from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.errors import ApiError, error_payload


def create_app() -> FastAPI:
    application = FastAPI(
        title="ExamGuard API",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    application.include_router(api_router)

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
