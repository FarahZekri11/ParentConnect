"""
app/routers/availability.py
───────────────────────────
GET    /api/babysitting/availability
POST   /api/babysitting/availability
PUT    /api/babysitting/availability/{id}
DELETE /api/babysitting/availability/{id}
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_client import RedisClient, get_redis_client
from app.core.exceptions import ForbiddenError, NotFoundError
from app.db.session import get_db
from app.repositories.availability_repository import AvailabilityRepository
from app.schemas.availability import (
    AvailabilityCreate,
    AvailabilityListResponse,
    AvailabilityRead,
    AvailabilityUpdate,
)
from app.security.dependencies import UserContext, get_current_user

router = APIRouter(prefix="/availability", tags=["Availability"])


@router.get(
    "",
    response_model=AvailabilityListResponse,
    summary="List availability slots",
    description="List availability slots for a given user (defaults to the authenticated user).",
)
async def list_availability(
    user_id: uuid.UUID | None = Query(
        None, description="User ID to query. Defaults to the authenticated user."
    ),
    active_only: bool = Query(True),
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis_client),
) -> AvailabilityListResponse:
    target_user_id = user_id or user.user_id

    # Try cache first
    cached = await redis.get_availability_list(target_user_id)
    if cached is not None:
        return AvailabilityListResponse(items=cached, total=len(cached))

    repo = AvailabilityRepository(db)
    items = await repo.list_by_user(target_user_id, active_only=active_only)
    serialised = [AvailabilityRead.model_validate(i).model_dump(mode="json") for i in items]

    await redis.set_availability_list(target_user_id, serialised)
    return AvailabilityListResponse(
        items=[AvailabilityRead.model_validate(i) for i in items],
        total=len(items),
    )


@router.post(
    "",
    response_model=AvailabilityRead,
    status_code=status.HTTP_201_CREATED,
    summary="Publish an availability slot",
    description="Create a recurring (weekly) or one-off availability slot.",
)
async def create_availability(
    body: AvailabilityCreate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis_client),
) -> AvailabilityRead:
    repo = AvailabilityRepository(db)
    obj = await repo.create(user.user_id, body)
    await db.commit()

    # Invalidate cache for this user
    await redis.invalidate_availability(user.user_id)

    return AvailabilityRead.model_validate(obj)


@router.put(
    "/{availability_id}",
    response_model=AvailabilityRead,
    summary="Update an availability slot",
)
async def update_availability(
    availability_id: uuid.UUID,
    body: AvailabilityUpdate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis_client),
) -> AvailabilityRead:
    repo = AvailabilityRepository(db)
    obj = await repo.get_by_id(availability_id)
    if obj is None:
        raise NotFoundError(f"Availability {availability_id} not found")
    if obj.user_id != user.user_id:
        raise ForbiddenError("You can only update your own availability slots")

    updated = await repo.update(availability_id, body)
    await db.commit()

    await redis.invalidate_availability(user.user_id)
    return AvailabilityRead.model_validate(updated)


@router.delete(
    "/{availability_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete (deactivate) an availability slot",
    description="Soft-deletes the slot by setting is_active=False.",
)
async def delete_availability(
    availability_id: uuid.UUID,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis_client),
) -> None:
    repo = AvailabilityRepository(db)
    obj = await repo.get_by_id(availability_id)
    if obj is None:
        raise NotFoundError(f"Availability {availability_id} not found")
    if obj.user_id != user.user_id:
        raise ForbiddenError("You can only delete your own availability slots")

    await repo.deactivate(availability_id)
    await db.commit()

    await redis.invalidate_availability(user.user_id)
