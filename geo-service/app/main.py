from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import logging
import time
import uuid
from typing import AsyncGenerator

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import settings
from app.database import db_manager
from app.events.consumer import event_consumer
from app.events.publisher import event_publisher
from app.routers import health_router, internal_router, public_router


# ==============================================================================
# Structured JSON Logging Formatter
# ==============================================================================
class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects without logging PII or coordinates."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": settings.SERVICE_NAME,
            "message": record.getMessage(),
            "logger": record.name,
        }
        # Add request context if available
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        if hasattr(record, "user_id"):
            log_entry["user_id"] = record.user_id

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)


# Configure root logger with JSONFormatter
root_logger = logging.getLogger()
root_logger.setLevel(settings.LOG_LEVEL)
# Remove default handlers to avoid duplicate unformatted logs
for handler in root_logger.handlers[:]:
    root_logger.removeHandler(handler)

console_handler = logging.StreamHandler()
console_handler.setFormatter(JSONFormatter())
root_logger.addHandler(console_handler)

logger = logging.getLogger("app.main")


# ==============================================================================
# Application Lifespan
# ==============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Manage lifecycle events:
    1. Connect to MongoDB and create 2dsphere and unique indexes.
    2. Start RabbitMQ publisher with robust background reconnection.
    3. Start RabbitMQ consumer for domain events.
    4. Gracefully close connections on shutdown.
    """
    logger.info("Initializing Geo & Neighborhood Service...")

    # 1. MongoDB initialization
    try:
        await db_manager.connect()
        await db_manager.create_indexes()
        logger.info("MongoDB connected and indexes verified.")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}", exc_info=True)

    # 2. RabbitMQ Publisher (non-blocking)
    try:
        await event_publisher.start_background_reconnect()
    except Exception as e:
        logger.warning(f"RabbitMQ publisher initialization deferred: {e}")

    # 3. RabbitMQ Consumer (non-blocking background task)
    try:
        await event_consumer.start()
    except Exception as e:
        logger.warning(f"RabbitMQ consumer initialization deferred: {e}")

    logger.info("Geo & Neighborhood Service startup complete.")

    yield

    logger.info("Shutting down Geo & Neighborhood Service...")
    # Stop consumer
    try:
        await event_consumer.stop()
    except Exception as e:
        logger.error(f"Error stopping consumer: {e}")

    # Close publisher
    try:
        await event_publisher.close()
    except Exception as e:
        logger.error(f"Error closing publisher: {e}")

    # Close database connection
    try:
        await db_manager.close()
    except Exception as e:
        logger.error(f"Error closing database: {e}")

    logger.info("Service shutdown completed cleanly.")


# ==============================================================================
# FastAPI Application Declaration
# ==============================================================================
app = FastAPI(
    title="Geo & Neighborhood Service",
    description="ParentConnect Geospatial Microservice - Neighborhoods, Privacy-blurred Locations, and Safe Meeting Points",
    version="1.0.0",
    docs_url="/api/geo/docs",
    openapi_url="/api/geo/openapi.json",
    lifespan=lifespan
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# Request Tracing & Structured Logging Middleware
# ==============================================================================
@app.middleware("http")
async def request_tracing_middleware(request: Request, call_next) -> Response:
    """
    Propagate or generate X-Request-ID header.
    Log request processing duration without logging coordinates or sensitive payload.
    """
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id

    start_time = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

    response.headers["X-Request-ID"] = request_id

    # Mask coordinates: log only method, sanitized path, status and duration
    extra = {"request_id": request_id}
    logger.info(
        f"{request.method} {request.url.path} - Status: {response.status_code} - Duration: {duration_ms}ms",
        extra=extra
    )

    return response


# ==============================================================================
# Router Registrations
# ==============================================================================
# Health and readiness (root-level for standard k8s/docker probes)
app.include_router(health_router)

# Public endpoints (gateway preserves prefix /api/geo)
app.include_router(public_router, prefix="/api/geo")

# Internal endpoints (only accessible within cluster with X-Internal-Key)
app.include_router(internal_router, prefix="/internal/geo")

# ==============================================================================
# Prometheus Instrumentation
# ==============================================================================
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

