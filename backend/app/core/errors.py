from dataclasses import dataclass, field
from typing import Any


@dataclass
class ApiError(Exception):
    status_code: int
    code: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)


def error_payload(error: ApiError) -> dict[str, object]:
    return {
        "error": {
            "code": error.code,
            "message": error.message,
            "details": error.details,
        }
    }
