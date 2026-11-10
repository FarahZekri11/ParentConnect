"""
app/routers/bookings.py
───────────────────────
POST   /api/babysitting/bookings         (direct booking – optional flow)
GET    /api/babysitting/bookings         (mine)
PATCH  /api/babysitting/bookings/{id}/cancel
PATCH  /api/babysitting/bookings/{id}/complete
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_client import RedisClient, get_redis_client
from app.core.exceptions import NotFoundError
from app.db.session import get_db
from app.events.publisher import get_event_publisher
from app.repositories.booking_repository import BookingRepository
from app.schemas.booking import BookingListResponse, BookingRead
from app.security.dependencies import UserContext, get_current_user
from app.services.booking_service import BookingService

router = APIRouter(prefix="/bookings", tags=["Bookings"])


@router.get(
    "",
    response_model=BookingListResponse,
    summary="List my bookings",
    description="Returns all bookings where the authenticated user is the requester or babysitter.",
)
async def list_bookings(
    as_requester: bool = Query(True),
    as_babysitter: bool = Query(True),
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingListResponse:
    repo = BookingRepository(db)
    items = await repo.list_for_user(
        user.user_id, as_requester=as_requester, as_babysitter=as_babysitter
    )
    return BookingListResponse(
        items=[BookingRead.model_validate(b) for b in items],
        total=len(items),
    )


@router.patch(
    "/{booking_id}/cancel",
    response_model=BookingRead,
    summary="Cancel a booking",
    description="Cancel a PENDING or ACCEPTED booking. Both parties can cancel.",
)
async def cancel_booking(
    booking_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis_client),
) -> BookingRead:
    publisher = get_event_publisher(redis._redis)
    svc = BookingService(session=db, redis=redis, event_publisher=publisher)
    booking = await svc.cancel_booking(booking_id, user.user_id)
    return BookingRead.model_validate(booking)


@router.patch(
    "/{booking_id}/complete",
    response_model=BookingRead,
    summary="Mark a booking as completed",
    description=(
        "Mark an ACCEPTED booking as COMPLETED. "
        "Time credits are transferred: requester spends, babysitter earns."
    ),
)
async def complete_booking(
    booking_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis_client),
) -> BookingRead:
    publisher = get_event_publisher(redis._redis)
    svc = BookingService(session=db, redis=redis, event_publisher=publisher)
    booking = await svc.complete_booking(booking_id, user.user_id)
    return BookingRead.model_validate(booking)
