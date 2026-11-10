"""
app/routers/matching.py
────────────────────────
GET /api/babysitting/matches?request_id=...
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_client import RedisClient, get_redis_client
from app.clients.identity_client import get_identity_client
from app.core.exceptions import NotFoundError
from app.db.session import get_db
from app.repositories.request_repository import BabysittingRequestRepository
from app.schemas.matching import MatchListResponse, MatchResult
from app.security.dependencies import UserContext, get_current_user
from app.services.matching_service import MatchingService

router = APIRouter(prefix="/matches", tags=["Matching"])


@router.get(
    "",
    response_model=MatchListResponse,
    summary="Find matches for a babysitting request",
    description=(
        "Returns ranked availability slots compatible with the given request. "
        "Results are cached in Redis (TTL: CACHE_TTL_SECONDS). "
        "Cache is invalidated when availabilities change."
    ),
)
async def get_matches(
    request_id: uuid.UUID = Query(..., description="ID of the babysitting request to match"),
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis_client),
) -> MatchListResponse:
    # Try cache first
    cached = await redis.get_match_results(request_id)
    if cached is not None:
        # Rebuild typed objects from cache
        matches = [MatchResult(**m) for m in cached]
        return MatchListResponse(
            request_id=request_id,
            matches=matches,
            total=len(matches),
        )

    # Validate request exists
    req_repo = BabysittingRequestRepository(db)
    request = await req_repo.get_by_id(request_id)
    if request is None:
        raise NotFoundError(f"BabysittingRequest {request_id} not found")

    identity_client = get_identity_client()
    svc = MatchingService(session=db, identity_client=identity_client)
    result = await svc.find_matches(request)

    # Store in cache
    serialised = [m.model_dump(mode="json") for m in result.matches]
    await redis.set_match_results(request_id, serialised)

    return result
