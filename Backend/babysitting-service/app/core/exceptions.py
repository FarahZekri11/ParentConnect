"""
app/core/exceptions.py
──────────────────────
Domain exception hierarchy + FastAPI global error handlers.
All domain errors inherit from AppException so a single handler catches them.
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


# ── Base ──────────────────────────────────────────────────────────────────────

class AppException(Exception):
    """Base class for all domain exceptions."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code: str = "INTERNAL_ERROR"

    def __init__(self, detail: str, error_code: str | None = None) -> None:
        self.detail = detail
        if error_code:
            self.error_code = error_code
        super().__init__(detail)


# ── HTTP 4xx ──────────────────────────────────────────────────────────────────

class NotFoundError(AppException):
    status_code = status.HTTP_404_NOT_FOUND
    error_code = "NOT_FOUND"

    def __init__(self, detail: str = "Resource not found") -> None:
        super().__init__(detail)


class ConflictError(AppException):
    status_code = status.HTTP_409_CONFLICT
    error_code = "CONFLICT"

    def __init__(self, detail: str = "Resource conflict") -> None:
        super().__init__(detail)


class ForbiddenError(AppException):
    status_code = status.HTTP_403_FORBIDDEN
    error_code = "FORBIDDEN"

    def __init__(self, detail: str = "Access forbidden") -> None:
        super().__init__(detail)


class UnauthorizedError(AppException):
    status_code = status.HTTP_401_UNAUTHORIZED
    error_code = "UNAUTHORIZED"

    def __init__(self, detail: str = "Authentication required") -> None:
        super().__init__(detail)


class BadRequestError(AppException):
    status_code = status.HTTP_400_BAD_REQUEST
    error_code = "BAD_REQUEST"

    def __init__(self, detail: str = "Bad request") -> None:
        super().__init__(detail)


class InsufficientCreditsError(AppException):
    status_code = status.HTTP_400_BAD_REQUEST
    error_code = "INSUFFICIENT_CREDITS"

    def __init__(self, detail: str = "Insufficient time credits to complete this booking") -> None:
        super().__init__(detail)


class DoubleBookingError(ConflictError):
    error_code = "DOUBLE_BOOKING"

    def __init__(self, detail: str = "Time slot already booked or overlaps an existing booking") -> None:
        super().__init__(detail)


class StateTransitionError(BadRequestError):
    error_code = "INVALID_STATE_TRANSITION"

    def __init__(self, detail: str = "Invalid booking state transition") -> None:
        super().__init__(detail)


class RateLimitError(AppException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    error_code = "RATE_LIMITED"

    def __init__(self, detail: str = "Too many requests, please slow down") -> None:
        super().__init__(detail)


# ── Handlers ──────────────────────────────────────────────────────────────────

def _make_error_body(exc: AppException) -> dict[str, Any]:
    return {"detail": exc.detail, "error_code": exc.error_code}


def register_exception_handlers(app: FastAPI) -> None:
    """Register all global exception handlers on the FastAPI app."""

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        from app.core.logging import get_logger

        logger = get_logger("exceptions")
        if exc.status_code >= 500:
            logger.error("unhandled_domain_error", detail=exc.detail, error_code=exc.error_code)
        else:
            logger.warning("domain_error", detail=exc.detail, error_code=exc.error_code)
        return JSONResponse(status_code=exc.status_code, content=_make_error_body(exc))

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        from app.core.logging import get_logger

        logger = get_logger("exceptions")
        logger.exception("unexpected_error", error=str(exc))
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "An unexpected error occurred.", "error_code": "INTERNAL_ERROR"},
        )
