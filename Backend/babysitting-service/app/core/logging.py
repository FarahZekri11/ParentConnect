"""
app/core/logging.py
───────────────────
Structured logging using structlog.
  • development  → coloured ConsoleRenderer (human-readable)
  • production   → JSONRenderer (machine-readable, compatible with log aggregators)

Usage:
    from app.core.logging import get_logger
    logger = get_logger(__name__)
    logger.info("booking_created", booking_id=str(booking.id))
"""
from __future__ import annotations

import logging
import sys
from typing import Any

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import get_settings


def configure_logging() -> None:
    """
    Call once at application startup to initialise structlog.
    Idempotent – safe to call multiple times.
    """
    settings = get_settings()
    log_level = getattr(logging, settings.LOG_LEVEL, logging.INFO)

    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.is_production:
        # Machine-readable JSON for log aggregators (Loki, CloudWatch, etc.)
        renderer: Any = structlog.processors.JSONRenderer()
    else:
        # Human-readable coloured output for local development
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=shared_processors
        + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(log_level)

    # Quieten noisy third-party loggers
    for noisy in ("uvicorn.access", "sqlalchemy.engine", "httpx"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    """Return a bound structlog logger for the given module name."""
    return structlog.get_logger(name)  # type: ignore[return-value]


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Logs every HTTP request/response with method, path, status code and
    elapsed time. Binds request_id to the structlog context so it appears
    in every log line emitted during request processing.
    """

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        import time
        import uuid

        request_id = str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        logger = get_logger("http")
        start = time.perf_counter()
        try:
            response: Response = await call_next(request)
            elapsed_ms = (time.perf_counter() - start) * 1000
            logger.info(
                "request_completed",
                status_code=response.status_code,
                elapsed_ms=round(elapsed_ms, 2),
            )
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start) * 1000
            logger.error(
                "request_failed",
                error=str(exc),
                elapsed_ms=round(elapsed_ms, 2),
            )
            raise
