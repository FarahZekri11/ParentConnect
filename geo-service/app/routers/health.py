from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.database import db_manager
from app.events.publisher import event_publisher

router = APIRouter(tags=["Health & Readiness"])


class HealthResponse(BaseModel):
    status: str = "ok"


class ReadinessResponse(BaseModel):
    status: str
    mongo: bool
    rabbitmq: bool


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness probe",
    description="Returns HTTP 200 as long as the service container process is running."
)
async def liveness_check() -> HealthResponse:
    """Basic liveness probe."""
    return HealthResponse(status="ok")


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Readiness probe",
    description="Checks MongoDB and RabbitMQ connectivity. Returns 503 if essential dependencies are unreachable."
)
async def readiness_check(response: Response) -> ReadinessResponse:
    """Readiness probe checking database and message broker state."""
    mongo_ok = await db_manager.is_healthy()
    rabbitmq_ok = event_publisher.is_connected

    # Service is considered ready if database is up (RabbitMQ has background retry)
    # But status report clearly indicates state of both
    is_ready = mongo_ok
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return ReadinessResponse(
        status="ready" if is_ready else "not_ready",
        mongo=mongo_ok,
        rabbitmq=rabbitmq_ok
    )
