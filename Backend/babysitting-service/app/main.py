"""
app/main.py
───────────
FastAPI application factory for the Babysitting Service.

Startup sequence:
  1. Configure structured logging.
  2. Create Redis client and store globally.
  3. (Optional) verify DB connectivity.

Shutdown sequence:
  1. Close Redis connection.

Routers mounted under /api/babysitting/** as required by the API Gateway contract.
Swagger UI available at /docs; ReDoc at /redoc.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cache.redis_client import RedisClient, set_redis_client
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import RequestLoggingMiddleware, configure_logging, get_logger
from app.routers import availability, bookings, credits, dev, matching, ratings, requests
from app.schemas.common import HealthResponse

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    configure_logging()
    logger = get_logger("lifespan")

    # Initialise Redis
    redis = RedisClient(settings.REDIS_URL)
    if not await redis.ping():
        logger.warning("redis_ping_failed", url=settings.REDIS_URL)
    else:
        logger.info("redis_connected", url=settings.REDIS_URL)
    set_redis_client(redis)

    logger.info("service_started", service=settings.SERVICE_NAME, version=settings.SERVICE_VERSION)
    yield

    # Cleanup
    await redis.close()
    logger.info("service_shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="ParentConnect – Babysitting Service",
        description=(
            "Hyperlocal mutual-aid childcare service. "
            "Manages babysitting requests, availability, bookings, "
            "time credits, ratings, and matching. "
            "\n\n**Auth**: Obtain a JWT from the Identity service (or use `POST /dev/token` in dev). "
            "Click **Authorize** and enter: `Bearer <token>`."
        ),
        version=settings.SERVICE_VERSION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
        contact={"name": "Babysitting Team", "email": "babysitting@parentconnect.local"},
        license_info={"name": "MIT"},
    )

    # ── Middleware ────────────────────────────────────────────────────────────
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if not settings.is_production else [],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Global exception handlers ─────────────────────────────────────────────
    register_exception_handlers(app)

    # ── Health endpoint ───────────────────────────────────────────────────────
    @app.get(
        "/health",
        response_model=HealthResponse,
        tags=["Health"],
        summary="Service health check",
    )
    async def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service=settings.SERVICE_NAME,
            version=settings.SERVICE_VERSION,
            timestamp=datetime.now(tz=timezone.utc),
        )

    # ── API routers ────────────────────────────────────────────────────────────
    PREFIX = "/api/babysitting"

    app.include_router(requests.router, prefix=PREFIX)
    app.include_router(availability.router, prefix=PREFIX)
    app.include_router(bookings.router, prefix=PREFIX)
    app.include_router(credits.router, prefix=PREFIX)
    app.include_router(ratings.router, prefix=PREFIX)
    app.include_router(matching.router, prefix=PREFIX)

    # Dev router – only mounted outside production
    if not settings.is_production:
        app.include_router(dev.router)

    return app


app = create_app()
