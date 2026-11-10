"""
app/routers/requests.py
───────────────────────
POST   /api/babysitting/requests
GET    /api/babysitting/requests
GET    /api/babysitting/requests/{id}
POST   /api/babysitting/requests/{id}/accept
"""
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_client import RedisClient, get_redis_client
from app.clients.identity_client import get_identity_client
from app.core.exceptions import ForbiddenError, NotFoundError, RateLimitError
from app.db.session import get_db
from app.events.publisher import get_event_publisher
from app.models.request import RequestStatusEnum
from app.repositories.request_repository import (
    BabysittingRequestRepository,
    RequestFilters,
)
from app.schemas.booking import AcceptRequestBody, BookingRead
from app.schemas.request import (
    BabysittingRequestCreate,
    BabysittingRequestListResponse,
    BabysittingRequestRead,
)
from app.security.dependencies import UserContext, get_current_user
from app.services.booking_service import BookingService

router = APIRouter(prefix="/requests", tags=["Requests"])


@router.post(
    "",
    response_model=BabysittingRequestRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a babysitting request",
    description=(
        "A parent creates a new open request for childcare. "
        "Only users can submit requests on their own behalf."
    ),
)
async def create_request(
    body: BabysittingRequestCreate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis_client),
) -> BabysittingRequestRead:
    # Rate limit: max 10 requests per hour per user
    allowed = await redis.check_rate_limit(user.user_id, "create_request", 10, 3600)
    if not allowed:
        raise RateLimitError("Too many requests created. Limit: 10 per hour.")

    repo = BabysittingRequestRepository(db)
    obj = await repo.create(user.user_id, body)
    await db.commit()
    return BabysittingRequestRead.model_validate(obj)


@router.get(
    "",
    response_model=BabysittingRequestListResponse,
    summary="List babysitting requests",
    description="Browse open requests. Supports filtering by date, neighbourhood, and status.",
)
async def list_requests(
    request_date: date | None = Query(None, alias="date", description="Filter by date (YYYY-MM-DD)"),
    neighborhood: str | None = Query(None, description="Filter by neighbourhood (partial match)"),
    status_filter: RequestStatusEnum | None = Query(None, alias="status"),
    mine: bool = Query(False, description="Return only my requests"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BabysittingRequestListResponse:
    repo = BabysittingRequestRepository(db)
    filters = RequestFilters(
        date=request_date,
        neighborhood=neighborhood,
        status=status_filter,
        requester_id=user.user_id if mine else None,
    )
    items, total = await repo.list(filters, page=page, page_size=page_size)
    return BabysittingRequestListResponse(
        items=[BabysittingRequestRead.model_validate(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{request_id}",
    response_model=BabysittingRequestRead,
    summary="Get a babysitting request by ID",
)
async def get_request(
    request_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BabysittingRequestRead:
    repo = BabysittingRequestRepository(db)
    obj = await repo.get_by_id(request_id)
    if obj is None:
        raise NotFoundError(f"Request {request_id} not found")
    return BabysittingRequestRead.model_validate(obj)


@router.post(
    "/{request_id}/accept",
    response_model=BookingRead,
    status_code=status.HTTP_201_CREATED,
    summary="Accept a babysitting request",
    description=(
        "A babysitter accepts an OPEN request using one of their availability slots. "
        "Creates a PENDING booking. Prevents double-booking via Redis lock + DB check."
    ),
)
async def accept_request(
    request_id: uuid.UUID,
    body: AcceptRequestBody,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis_client),
) -> BookingRead:
    identity_client = get_identity_client()
    publisher = get_event_publisher(redis._redis)
    svc = BookingService(session=db, redis=redis, event_publisher=publisher)
    booking = await svc.accept_request(
        request_id=request_id,
        babysitter_id=user.user_id,
        availability_id=body.availability_id,
    )
    return BookingRead.model_validate(booking)
