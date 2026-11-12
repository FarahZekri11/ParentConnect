from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from app.database import get_db
from app.models.internal import DistanceBetweenUsersResponse, UserWithinResponse
from app.security import verify_internal_key
from app.services.location_service import LocationService

router = APIRouter(tags=["Internal - Geo Service"])


@router.get(
    "/users-within",
    response_model=List[UserWithinResponse],
    summary="Query users within radius (Internal microservices only)",
    description="""
    Used by Marketplace, Babysitting, and Events services to find users within a geographical boundary.
    - Requires header: `X-Internal-Key`
    - Preserves exact distances in meters (no anti-triangulation rounding).
    - Query uses MongoDB $geoNear spatial index for high-performance retrieval.
    """
)
async def get_users_within(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Center latitude", examples=[36.8065]),
    lng: float = Query(..., ge=-180.0, le=180.0, description="Center longitude", examples=[10.1815]),
    radius: float = Query(
        ...,
        gt=0.0,
        le=settings.MAX_SEARCH_RADIUS_M,
        description=f"Search radius in meters (max {settings.MAX_SEARCH_RADIUS_M})",
        examples=[3000.0]
    ),
    limit: int = Query(50, ge=1, le=500, description="Maximum number of users to return"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    _: str = Depends(verify_internal_key),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> List[UserWithinResponse]:
    """Execute spatial $geoNear aggregation and return unrounded list of matching parents."""
    pipeline = [
        {
            "$geoNear": {
                "near": {"type": "Point", "coordinates": [lng, lat]},
                "distanceField": "distance_m",
                "maxDistance": radius,
                "spherical": True,
                "query": {"location": {"$exists": True}}
            }
        },
        {"$skip": skip},
        {"$limit": limit},
        {
            "$project": {
                "_id": 0,
                "user_id": 1,
                "distance_m": 1
            }
        }
    ]

    cursor = db.user_locations.aggregate(pipeline)
    results = await cursor.to_list(length=limit)

    return [
        UserWithinResponse(
            user_id=r["user_id"],
            distance_m=round(float(r["distance_m"]), 2)
        )
        for r in results
    ]


@router.get(
    "/distance",
    response_model=DistanceBetweenUsersResponse,
    summary="Get exact distance between two users (Internal microservices only)",
    description="""
    Used by Babysitting and Marketplace services to calculate accurate distance between two registered parents.
    - Requires header: `X-Internal-Key`
    """
)
async def get_distance_between_users(
    userA: str = Query(..., min_length=1, description="First user identifier"),
    userB: str = Query(..., min_length=1, description="Second user identifier"),
    _: str = Depends(verify_internal_key),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> DistanceBetweenUsersResponse:
    """Compute direct distance in meters between userA and userB."""
    dist = await LocationService.get_proximity_between_users(db, caller_id=userA, target_id=userB)
    if dist is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Distance could not be calculated: user {userA} or user {userB} has not registered location"
        )
    return DistanceBetweenUsersResponse(userA=userA, userB=userB, distance_m=dist)
