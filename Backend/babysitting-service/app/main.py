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
from app.clients.eureka_client import get_eureka_client
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import RequestLoggingMiddleware, configure_logging, get_logger
from app.events.publisher import close_rabbitmq_publisher, get_rabbitmq_publisher
from app.routers import admin, availability, bookings, credits, dev, matching, ratings, requests
from app.schemas.common import HealthResponse

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    configure_logging()
    logger = get_logger("lifespan")
    current_settings = get_settings()

    # Initialise Redis (optional, does not block startup or tests)
    redis = RedisClient(current_settings.REDIS_URL)
    if not current_settings.is_test:
        if not await redis.ping():
            logger.warning("redis_ping_failed", url=current_settings.REDIS_URL)
        else:
            logger.info("redis_connected", url=current_settings.REDIS_URL)
    set_redis_client(redis)

    # ── Eureka registration (service discovery) ─────────────────────────────
    eureka = get_eureka_client()
    if current_settings.EUREKA_ENABLED and not current_settings.is_test:
        try:
            await eureka.register()
            # Boucle lancée même si Eureka n'était pas encore joignable (redémarrage de Docker, ordre de
            # démarrage) : chaque heartbeat retente l'enregistrement tant qu'il n'a pas réussi.
            await eureka.start_heartbeat_loop()
        except Exception as exc:
            logger.warning("eureka_registration_failed", error=str(exc))
    else:
        logger.info("eureka_disabled", reason="EUREKA_ENABLED=false or test mode")

    # ── RabbitMQ publisher initialization ───────────────────────────────────
    if current_settings.RABBITMQ_ENABLED and not current_settings.is_test:
        try:
            rmq_publisher = get_rabbitmq_publisher()
            logger.info("rabbitmq_configured", host=current_settings.RABBITMQ_HOST, exchange=current_settings.RABBITMQ_EXCHANGE)
        except Exception as exc:
            logger.warning("rabbitmq_init_warning", error=str(exc))

    logger.info(
        "service_started",
        service=current_settings.SERVICE_NAME,
        version=current_settings.SERVICE_VERSION,
        port=current_settings.port,
    )
    yield

    # Cleanup
    if current_settings.EUREKA_ENABLED and not current_settings.is_test:
        try:
            await eureka.stop_heartbeat()
            await eureka.deregister()
        except Exception as exc:
            logger.warning("eureka_deregister_failed", error=str(exc))

    if current_settings.RABBITMQ_ENABLED and not current_settings.is_test:
        await close_rabbitmq_publisher()

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

    # ── Health endpoints (Public / No Auth) ───────────────────────────────────
    @app.get(
        "/health",
        response_model=HealthResponse,
        tags=["Health"],
        summary="Service health check",
    )
    @app.get(
        "/api/health",
        response_model=HealthResponse,
        tags=["Health"],
        summary="Service health check (Gateway API route)",
    )
    @app.get(
        "/api/babysitting/health",
        response_model=HealthResponse,
        tags=["Health"],
        summary="Service health check (Prefix route)",
    )
    async def health() -> HealthResponse:
        current_settings = get_settings()
        return HealthResponse(
            status="ok",
            service=current_settings.SERVICE_NAME,
            version=current_settings.SERVICE_VERSION,
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
    app.include_router(admin.router, prefix=PREFIX)

    # Dev router – only mounted outside production
    if not settings.is_production:
        app.include_router(dev.router)

    return app


app = create_app()
